/**
 * 米家山水务 桌面小组件 (widget.tsx)
 * systemSmall / systemMedium / systemLarge / accessory 布局, 数据与配置页共享缓存
 *
 * 移植自兴能燃气版, 保持同一套已验证布局:
 * 1. 余额取值: 0 / "0" 是合法结果, 不能用 || 兜底
 * 2. 固定高度间隔用 Gap 组件, 不用弹性 Spacer(会把卡片背景弹开)
 * 3. 中尺寸分割线必须显式给高度
 * 4. 宽度按 displaySize 计算, 适配不同机型
 * 5. 未配置凭证时不发起网络请求, 直接渲染引导页
 * 6. 刷新间隔钳制在 15~1440 分钟; 失败时 15 分钟重试
 * 7. 新增 accessory 锁屏布局
 * 8. 低余额告警用橙色, 不与欠费红色混淆
 * 9. 大号组件下方为历史月份账单 (用量 + 表底读数)
 */
import { Script, Widget, VStack, HStack, Text, Image, Spacer, Capsule, type Color, type DynamicShapeStyle } from "scripting";
import { Settings, GasData, loadSettings, fetchGasInfo, getToken } from "./store";
import { formatMoney, formatCustCode, formatCompName, isOwe, getBalanceRatio, getCapsuleActiveCount, getBarColors, interpolateHex, displayBalance, BRAND } from "./format";

// 深浅色
const BG: DynamicShapeStyle = { light: "#FFFFFF", dark: "#111827" };
const CARD: DynamicShapeStyle = { light: "#F8FAFC", dark: "#161E2E" };
const PILL: DynamicShapeStyle = { light: "#F3F4F6", dark: "#1F2937" };
const SUB: DynamicShapeStyle = { light: "#6B7280", dark: "#9CA3AF" };
const MAIN: DynamicShapeStyle = { light: "#111827", dark: "#F9FAFB" };
const BAR_BG: DynamicShapeStyle = { light: "#E5E7EB", dark: "#374151" };
const DIVIDER: DynamicShapeStyle = { light: "#E5E7EB", dark: "#1F2937" };
const RED: Color = "#EF4444";
const BLUE: Color = "#3B82F6";

/** 低余额阈值 (元): 低于该值金额显示红色 */
const LOW_BALANCE = 30;

/** 余额数值: 兼容 "¥21.10" 之类的字符串, 解析失败按 0 处理 */
function balanceNum(d: GasData): number {
  const raw = String(balanceRaw(d)).replace(/[^\d.\-]/g, "");
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** 低余额提示色: 用橙色而非红色, 避免与"欠费"混淆 */
const LOW_BAL_CONST = "#F59E0B";

/** 金额颜色: 欠费用红色; 低余额用橙色提醒; 否则正常色 */
function amountColor(d: GasData, balanceColor: Color): Color {
  if (isOwe(d)) return RED;
  if (balanceNum(d) < LOW_BALANCE) return LOW_BAL_CONST as Color;
  return balanceColor;
}

/** 余额原始值: 0 与 "0" 都是合法结果, 不能用 || 兜底 */
function balanceRaw(d: GasData): string | number {
  const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
  if (has(d.countMoney)) return d.countMoney as unknown as string | number;
  if (has(d.newCountMoney)) return d.newCountMoney as unknown as string | number;
  return 0;
}

/** 胶囊进度条 */
function CapsuleBar({ width, height, total, active, startColor, endColor }: {
  width: number; height: number; total: number; active: number; startColor: Color; endColor: Color;
}) {
  const gap = 3.5;
  const segW = (width - gap * (total - 1)) / total;
  return (
    <HStack spacing={gap}>
      {Array.from({ length: total }, (_, i) => (
        <Capsule
          key={i}
          fill={i < active
            ? interpolateHex(startColor, endColor, active > 1 ? i / (active - 1) : 0)
            : BAR_BG}
          frame={{ width: segW, height }}
        />
      ))}
    </HStack>
  );
}

/** 图标信息行: 标签紧跟数值(不留中间空白), 长值优先占宽 */
function InfoRow({ icon, iconColor, label, value, s, valueFont, labelFont, priority }: {
  icon: string; iconColor: Color; label: string; value: string; s: number;
  valueFont?: number; labelFont?: number; priority?: number;
}) {
  return (
    <HStack alignment="center" spacing={6}>
      <Image systemName={icon} resizable scaleToFit frame={{ width: 13 * s, height: 13 * s }} foregroundStyle={iconColor} />
      <Text font={labelFont ?? 10.5 * s} foregroundStyle={SUB} lineLimit={1} fixedSize={{ horizontal: true, vertical: false }}>{label}</Text>
      <Text
        font={valueFont ?? 11 * s}
        fontWeight="semibold"
        foregroundStyle={MAIN}
        lineLimit={1}
        layoutPriority={priority ?? 0}
      >
        {value}
      </Text>
    </HStack>
  );
}

function Pill({ children, s, radius, color }: { children: string; s: number; radius: number; color: Color }) {
  return (
    <HStack
      padding={{ top: 2 * s, bottom: 2 * s, leading: 6 * s, trailing: 6 * s }}
      background={{ style: PILL, shape: { type: "rect", cornerRadius: radius } }}
    >
      <Text font={9.5 * s} fontWeight="semibold" foregroundStyle={color}>{children}</Text>
    </HStack>
  );
}

/** 固定高度间隔: Spacer 是弹性的(minLength 只是下限), 在卡片内会把背景弹开, 用固定高度空容器代替 */
function Gap({ h }: { h: number }) {
  return <VStack spacing={0} frame={{ height: h }} />;
}

/** 抄表日期 → 账单月份标签, 如 "2026-09" → "2026年9月" */
function billMonth(date: string): string {
  const m = String(date || "").match(/^(\d{4})[-/](\d{1,2})/);
  if (!m) return date || "--";
  return `${m[1]}年${Number(m[2])}月`;
}

/** 账单明细单元: 上标签 + 下数值 */
function BillCell({ label, value, s, valueColor, align }: {
  label: string; value: string; s: number;
  valueColor?: Color | DynamicShapeStyle; align?: "leading" | "trailing";
}) {
  return (
    <VStack alignment={align === "trailing" ? "trailing" : "leading"} spacing={3 * s}>
      <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>{label}</Text>
      <Text font={14 * s} fontWeight="bold" foregroundStyle={valueColor ?? MAIN} lineLimit={1}>
        {value}
      </Text>
    </VStack>
  );
}

/** 小尺寸 */
function SmallView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#0EA5E9") as Color;
  const balanceColor = (settings.balanceColor || "#10B981") as Color;
  const owe = isOwe(d);
  const pX = 14 * s, pY = 12 * s;
  const contentW = Math.max(90, displayWidth - 2 * pX);
  const barW = contentW - 16 * s;

  return (
    <VStack alignment="leading" spacing={0}
      padding={{ top: pY, bottom: pY, leading: pX, trailing: pX }}
      widgetBackground={BG}>
      {/* 头部 */}
      <HStack alignment="center" spacing={5}>
        <Image systemName="drop.fill" resizable scaleToFit frame={{ width: 16 * s, height: 16 * s }} foregroundStyle={themeColor} />
        <Text font={12 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1} layoutPriority={1}>{settings.alias || BRAND}</Text>
        <Spacer minLength={2} />
        <Pill s={s} radius={6 * s} color={offline ? themeColor : balanceColor}>
          {offline ? "离线" : "● 正常"}
        </Pill>
      </HStack>

      <Spacer />

      {/* 余额 */}
      <Text font={11 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>{owe ? "水费欠费" : "账户余额"}</Text>
      <Text font={27 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
        ¥ {displayBalance(d)}
      </Text>

      <Spacer minLength={6 * s} />

      {/* 进度条 */}
      <CapsuleBar
        width={barW} height={5.5 * s} total={10}
        active={getCapsuleActiveCount(settings, d, 10)}
        startColor={getBarColors(settings, getBalanceRatio(settings, d), owe).start}
        endColor={getBarColors(settings, getBalanceRatio(settings, d), owe).end}
      />

      <Spacer />

      {/* 底部卡片 */}
      <VStack alignment="leading" spacing={3 * s}
        padding={{ top: 6 * s, bottom: 6 * s, leading: 8 * s, trailing: 8 * s }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 8 * s } }}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="gauge.badge.plus" resizable scaleToFit frame={{ width: 11 * s, height: 11 * s }} foregroundStyle={themeColor} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>抄表 {d.lastRecord || "0"} m³</Text>
          <Spacer minLength={2} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>{d._fetchTime || "刚刚"}</Text>
        </HStack>
        <HStack alignment="center" spacing={3}>
          <Image systemName="creditcard" resizable scaleToFit frame={{ width: 11 * s, height: 11 * s }} foregroundStyle={BLUE} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>户号 {formatCustCode(settings, d.custCode, true)}</Text>
        </HStack>
        {/* 户名单独一行: 水务户名常为小区+房号, 与户号同行必被截断 */}
        <HStack alignment="center" spacing={3}>
          <Image systemName="person.fill" resizable scaleToFit frame={{ width: 10 * s, height: 10 * s }} foregroundStyle={themeColor} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>{d.custName || BRAND}</Text>
        </HStack>
      </VStack>
    </VStack>
  );
}

/** 中尺寸 */
function MediumView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#0EA5E9") as Color;
  const balanceColor = (settings.balanceColor || "#10B981") as Color;
  const owe = isOwe(d);
  const pX = 16 * s, pY = 12 * s;
  const contentW = Math.max(200, displayWidth - 2 * pX);
  const gap = 12 * s;
  const leftW = Math.floor((contentW - gap - 1) * 0.47);

  return (
    <HStack alignment="center" spacing={gap}
      padding={{ top: pY, bottom: pY, leading: pX, trailing: pX }}
      widgetBackground={BG}>
      {/* 左列 */}
      <VStack alignment="leading" spacing={0} frame={{ width: leftW }}>
        <HStack alignment="center" spacing={5}>
          <Image systemName="drop.fill" resizable scaleToFit frame={{ width: 16 * s, height: 16 * s }} foregroundStyle={themeColor} />
          <Text font={13 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{settings.alias || BRAND}</Text>
        </HStack>
        {/* 上下弹性 Spacer 夹住中间块: 标题钉顶、状态行钉底, 余额+进度条在剩余空间垂直居中 */}
        <Spacer />
        <Text font={11 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>{owe ? "水费欠费 (元)" : "可用水费余额 (元)"}</Text>
        <Text font={28 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
          ¥ {displayBalance(d)}
        </Text>
        <Spacer minLength={7 * s} />
        <CapsuleBar
          width={leftW} height={7 * s} total={10}
          active={getCapsuleActiveCount(settings, d, 10)}
          startColor={getBarColors(settings, getBalanceRatio(settings, d), owe).start}
          endColor={getBarColors(settings, getBalanceRatio(settings, d), owe).end}
        />
        <Spacer />
        <HStack alignment="center" spacing={2}>
          <Text font={8 * s} foregroundStyle={owe ? RED : balanceColor}>●</Text>
          <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>{owe ? "账户已欠费 · 请及时充值" : "水表连接正常 · 水压稳定"}</Text>
        </HStack>
      </VStack>

      {/* 分割线: 必须显式给高度, 否则空容器高度为 0 画不出来 */}
      <VStack spacing={0} frame={{ width: 1, height: Math.round(92 * s) }} background={DIVIDER} />

      {/* 右列 */}
      <VStack alignment="leading" spacing={0}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="arrow.triangle.2.circlepath" resizable scaleToFit frame={{ width: 10 * s, height: 10 * s }} foregroundStyle={SUB} />
          <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>{d._fetchTime ? `更新时间 ${d._fetchTime}` : "实时同步"}</Text>
        </HStack>
        <Spacer />
        {/* 户名与户号拆两行: 水务户名常为「小区+房号」很长, 合在一行必然截断 */}
        <InfoRow icon="person.crop.rectangle" iconColor={themeColor} label="户名"
          value={d.custName || "--"}
          s={s} valueFont={9.5 * s} labelFont={10 * s} priority={1} />
        <Spacer />
        <InfoRow icon="number" iconColor={themeColor} label="水费户号"
          value={formatCustCode(settings, d.custCode)}
          s={s} valueFont={10 * s} labelFont={10 * s} />
        <Spacer />
        <InfoRow icon="speedometer" iconColor={BLUE} label="上次抄表" value={`${d.lastRecord || "0"} m³`} s={s} />
        <Spacer />
        <InfoRow icon="calendar.badge.clock" iconColor="#8B5CF6" label="抄表日期" value={d.lastRecordTime || "近期已抄表"} s={s} />
        <Spacer />
        <InfoRow icon="building.2" iconColor="#10B981" label="服务单位" value={formatCompName(settings, d.compName)} s={s} />
      </VStack>
    </HStack>
  );
}

/** 大尺寸 */
export function LargeView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#0EA5E9") as Color;
  const balanceColor = (settings.balanceColor || "#10B981") as Color;
  const owe = isOwe(d);
  const pX = 16 * s, pY = 14 * s;
  const contentW = Math.max(240, displayWidth - 2 * pX);
  const barW = Math.max(200 * s, contentW - 32 * s);
  const statusCol = owe ? RED : (offline ? themeColor : balanceColor);
  const barColors = getBarColors(settings, getBalanceRatio(settings, d), owe);
  // 历史账单: 取最近 6 期, 每期带用量相对条形, 信息更密实
  const allBills = (d.bills ?? []).filter(b => b && b.date);
  const billRows = allBills.slice(0, 6);
  // 条形基准: 这 6 期里的最大用量 (为空则按 1 避免除零)
  const maxUsage = Math.max(
    1,
    ...billRows.map(b => (b.usage !== null ? parseFloat(b.usage) || 0 : 0)),
  );
  // 汇总: 近 6 期总用量与月均
  const totalUsage = billRows.reduce((sum, b) => sum + (b.usage !== null ? parseFloat(b.usage) || 0 : 0), 0);
  const avgUsage = billRows.length > 0 ? totalUsage / billRows.length : 0;

  return (
    <VStack alignment="leading" spacing={0}
      padding={{ top: pY, bottom: pY, leading: pX, trailing: pX }}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
      widgetBackground={BG}>
      {/* 头部 */}
      <HStack alignment="center" spacing={6}>
        <Image systemName="drop.fill" resizable scaleToFit frame={{ width: 20 * s, height: 20 * s }} foregroundStyle={themeColor} />
        <Text font={15 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{(settings.alias || BRAND) + " 用水监控"}</Text>
        <Spacer minLength={4} />
        <Pill s={s} radius={6 * s} color={offline ? themeColor : balanceColor}>
          {offline ? "离线模式" : `更新时间 ${d._fetchTime || "刚刚"}`}
        </Pill>
      </HStack>

      <Gap h={12 * s} />

      {/* 余额主卡: 用固定间隔控制行距, 避免卡片被外层 Spacer 拉伸 */}
      <VStack alignment="leading" spacing={0}
        padding={{ top: 12 * s, bottom: 12 * s, leading: 16 * s, trailing: 16 * s }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 14 * s } }}>
        <Text font={11.5 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>
          {owe ? "账户欠费总额 (元)" : "当前账户可用水费余额 (元)"}
        </Text>
        <Text font={33 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
          ¥ {displayBalance(d)}
        </Text>
        <Gap h={9 * s} />
        <CapsuleBar width={barW} height={8 * s} total={14}
          active={getCapsuleActiveCount(settings, d, 14)}
          startColor={barColors.start} endColor={barColors.end} />
      </VStack>

      {/* 卡间固定小间隔, 剩余空间由账单卡内部均匀吸收 */}
      <Gap h={10 * s} />

      {/* 历史账单卡 */}
      <VStack alignment="leading" spacing={0}
        padding={{ top: 11 * s, bottom: 11 * s, leading: 14 * s, trailing: 14 * s }}
        frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 12 * s } }}>
        {/* 标题 + 账单笔数 */}
        <HStack alignment="center" spacing={5}>
          <Image systemName="list.bullet.rectangle" resizable scaleToFit frame={{ width: 13 * s, height: 13 * s }} foregroundStyle="#10B981" />
          <Text font={12 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>历史账单</Text>
          <Spacer minLength={4} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>
            {billRows.length > 0 ? `近 ${billRows.length} 期` : "暂无记录"}
          </Text>
        </HStack>

        <Gap h={7 * s} />
        <VStack spacing={0} frame={{ height: 1 }} background={DIVIDER} />
        <Gap h={7 * s} />

        {billRows.length === 0 ? (
          <Text font={11 * s} foregroundStyle={SUB}>暂未获取到历史抄表账单</Text>
        ) : (
          <VStack alignment="leading" spacing={5 * s}>
            {billRows.map((b, i) => {
              const u = b.usage !== null ? parseFloat(b.usage) || 0 : 0;
              const wRatio = Math.max(0.04, Math.min(1, u / maxUsage));
              const isLatest = i === 0;
              return (
                <VStack key={b.date + i} alignment="leading" spacing={2 * s}>
                  {/* 第1行: 月份 | 用量 | 读数 */}
                  <HStack alignment="center" spacing={0}>
                    <Text font={10.5 * s} fontWeight={isLatest ? "bold" : "regular"}
                      foregroundStyle={isLatest ? MAIN : SUB} lineLimit={1}
                      frame={{ width: 70 * s, alignment: "leading" }}>
                      {billMonth(b.date)}
                    </Text>
                    <Text font={11 * s} fontWeight="bold" foregroundStyle={isLatest ? themeColor : MAIN}
                      lineLimit={1} frame={{ width: 34 * s, alignment: "trailing" }}>
                      {b.usage !== null ? `${b.usage}` : "--"}
                    </Text>
                    <Text font={8.5 * s} foregroundStyle={SUB} lineLimit={1} frame={{ width: 40 * s, alignment: "leading" }}> m³</Text>
                    <Spacer minLength={6} />
                    <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>
                      读数 {b.reading}
                    </Text>
                  </HStack>
                  {/* 第2行: 用量条 (背景轨 + 填充) */}
                  <HStack spacing={0}>
                    <VStack spacing={0} frame={{ width: barW * wRatio, height: 3 * s }}
                      background={{ style: isLatest ? balanceColor : "#7DD3FC", shape: { type: "rect", cornerRadius: 1.5 * s } }} />
                    <VStack spacing={0} frame={{ maxWidth: Infinity, height: 3 * s }}
                      background={{ style: BAR_BG, shape: { type: "rect", cornerRadius: 1.5 * s } }} />
                  </HStack>
                </VStack>
              );
            })}

            {/* 汇总行: 近 N 期总用量 / 月均 */}
            <Gap h={2 * s} />
            <VStack spacing={0} frame={{ height: 1 }} background={DIVIDER} />
            <Gap h={1 * s} />
            <HStack alignment="center" spacing={0}>
              <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>
                {`近 ${billRows.length} 期总用量`}
              </Text>
              <Spacer minLength={4} />
              <Text font={10.5 * s} fontWeight="semibold" foregroundStyle={MAIN} lineLimit={1}>
                {`${Math.round(totalUsage * 100) / 100} m³`}
              </Text>
              <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>{`  ·  月均 `}</Text>
              <Text font={10.5 * s} fontWeight="semibold" foregroundStyle={themeColor} lineLimit={1}>
                {`${Math.round(avgUsage * 10) / 10} m³`}
              </Text>
            </HStack>
          </VStack>
        )}

        <Spacer minLength={8 * s} />

        {/* 户名户号 / 服务单位: 各自一行, 户名很长的情形(如小区房号)也不会被单位名挤掉 */}
        <HStack alignment="center" spacing={4}>
          <Image systemName="person.crop.rectangle" resizable scaleToFit frame={{ width: 10 * s, height: 10 * s }} foregroundStyle={themeColor} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>
            {(d.custName || "--") + " · " + formatCustCode(settings, d.custCode)}
          </Text>
          <Spacer minLength={4} />
          <Image systemName="building.2" resizable scaleToFit frame={{ width: 10 * s, height: 10 * s }} foregroundStyle="#10B981" />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>
            {formatCompName(settings, d.compName, false)}
          </Text>
        </HStack>
      </VStack>
    </VStack>
  );
}

/** 锁屏配件 (accessoryCircular / accessoryRectangular): 只放图标 + 金额, 避免圆形裁切 */
function AccessoryView({ settings, d }: { settings: Settings; d: GasData }) {
  const themeColor = (settings.themeColor || "#0EA5E9") as Color;
  const owe = isOwe(d);
  const amount = displayBalance(d);
  return (
    <VStack alignment="center" spacing={2} widgetBackground={BG}>
      <Image systemName="drop.fill" resizable scaleToFit frame={{ width: 15, height: 15 }} foregroundStyle={themeColor} />
      <Text font={13} fontWeight="bold" foregroundStyle={owe ? RED : MAIN} lineLimit={1}>¥ {amount}</Text>
    </VStack>
  );
}

/** 引导组件 (未配置凭证) */
function GuideView() {
  return (
    <VStack alignment="center" spacing={4} padding={16} widgetBackground={BG}>
      <Spacer />
      <Text font={15} fontWeight="bold" foregroundStyle="#0EA5E9">{BRAND}</Text>
      <Text font={12} fontWeight="bold" foregroundStyle={MAIN}>未检测到凭证配置</Text>
      <Text font={11} foregroundStyle={SUB}>请点击打开组件，在【账户设置】中输入参数或使用剪贴板智能解析。</Text>
      <Spacer />
    </VStack>
  );
}

/** 错误组件 (无数据且无缓存) */
function ErrorView() {
  return (
    <VStack alignment="center" spacing={4} padding={16} widgetBackground={BG}>
      <Spacer />
      <Text font={14} fontWeight="bold" foregroundStyle={RED}>数据连接失败</Text>
      <Text font={11} foregroundStyle={SUB}>网络超时且无离线缓存，请检查网络或重新配置凭证。</Text>
      <Spacer />
    </VStack>
  );
}

async function main() {
  const settings = loadSettings();
  const family = Widget.family;
  const displaySize = Widget.displaySize;

  const configured =
    (settings.custCode || "").trim() !== "" ||
    (settings.xMasAppInfo || "").trim() !== "" ||
    !!getToken(settings);

  // 未配置凭证时不再联网, 直接引导
  let data: GasData | null = null;
  let offline = false;
  if (configured) {
    const r = await fetchGasInfo(false, settings);
    data = r.data ?? null;
    offline = !!r.offline;
  }

  // 刷新间隔钳制 15~1440 分钟; 取不到数据时 15 分钟后重试
  const intervalMin = Math.min(1440, Math.max(15, Math.round(Number(settings.interval) || 360)));
  const reloadDate = new Date(Date.now() + (data ? intervalMin : 15) * 60 * 1000);

  let view: any;
  if (!configured) {
    view = <GuideView />;
  } else if (!data) {
    view = <ErrorView />;
  } else if (family === "accessoryCircular" || family === "accessoryRectangular") {
    view = <AccessoryView settings={settings} d={data} />;
  } else if (family === "systemMedium") {
    const s = Math.min(1.1, Math.max(0.85, displaySize.width / 364));
    view = <MediumView settings={settings} d={data} offline={offline} s={s} displayWidth={displaySize.width} />;
  } else if (family === "systemLarge") {
    const s = Math.min(1.1, Math.max(0.85, displaySize.width / 364));
    view = <LargeView settings={settings} d={data} offline={offline} s={s} displayWidth={displaySize.width} />;
  } else {
    // systemSmall 及其它一律紧凑布局
    const s = Math.min(1.1, Math.max(0.8, displaySize.width / 169));
    view = <SmallView settings={settings} d={data} offline={offline} s={s} displayWidth={displaySize.width} />;
  }

  Widget.present(view, { policy: "after", date: reloadDate });
  Script.exit();
}

// 仅在作为组件入口运行时渲染; 被 preview / 其它文件 import 时不执行 (避免 Widget.present 不可用报错)
if (Script.env === "widget") {
  main().catch(e => {
    // 出错也保证组件能渲染, 不留空白
    Widget.present(
      <VStack alignment="center" spacing={4} padding={16} widgetBackground={BG}>
        <Spacer />
        <Text font={14} fontWeight="bold" foregroundStyle={RED}>数据连接失败</Text>
        <Text font={10} foregroundStyle={SUB} lineLimit={3}>{e instanceof Error ? e.message : String(e)}</Text>
        <Spacer />
      </VStack>,
      { policy: "after", date: new Date(Date.now() + 15 * 60 * 1000) }
    );
    Script.exit();
  });
}
