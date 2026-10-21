/**
 * 米家山水务 桌面小组件 (widget.tsx)
 * 由 Scriptable 版 MijiaWaterGas 布局移植到 Scripting:
 * systemSmall / systemMedium / systemLarge, 数据与配置页共享缓存
 */
import { Script, Widget, VStack, HStack, Text, Image, Spacer, Capsule, type Color, type DynamicShapeStyle } from "scripting";
import { Settings, GasData, loadSettings, fetchGasInfo } from "./store";
import { amountColor, formatMoney, formatCustCode, formatCompName, isOwe, balanceRaw, getBalanceRatio, getCapsuleActiveCount, getBarColors, interpolateHex } from "./format";

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
const HOTLINE = "028-85818581";

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

/** 图标信息行: 标签紧跟数值 */
function InfoRow({ icon, iconColor, label, value, s, valueFont, labelFont, priority }: {
  icon: string; iconColor: Color; label: string; value: string; s: number;
  valueFont?: number; labelFont?: number; priority?: number;
}) {
  return (
    <HStack alignment="center" spacing={6}>
      <Image systemName={icon} resizable scaleToFit frame={{ width: 13 * s, height: 13 * s }} foregroundStyle={iconColor} />
      <Text font={labelFont ?? 10.5 * s} foregroundStyle={SUB} lineLimit={1} fixedSize={{ horizontal: true, vertical: false }}>{label}</Text>
      <Text font={valueFont ?? 11 * s} fontWeight="semibold" foregroundStyle={MAIN} lineLimit={1} layoutPriority={priority ?? 0}>
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

/** 小尺寸 */
function SmallView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#FF9500") as Color;
  const balanceColor = (settings.balanceColor || "#10B981") as Color;
  const owe = isOwe(d);
  const pX = 14 * s, pY = 12 * s;
  const contentW = Math.max(90, displayWidth - 2 * pX);
  const barW = contentW - 16 * s;

  return (
    <VStack alignment="leading" spacing={0}
      padding={{ top: pY, bottom: pY, leading: pX, trailing: pX }}
      widgetBackground={BG}>
      <HStack alignment="center" spacing={5}>
        <Image systemName="flame.fill" resizable scaleToFit frame={{ width: 16 * s, height: 16 * s }} foregroundStyle={themeColor} />
        <Text font={13 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{settings.alias || "米家山水务"}</Text>
        <Spacer minLength={2} />
        <Pill s={s} radius={6 * s} color={offline ? themeColor : balanceColor}>
          {offline ? "离线" : "● 正常"}
        </Pill>
      </HStack>

      <Spacer />

      <Text font={11 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>{owe ? "水费欠费" : "账户余额"}</Text>
      <Text font={27 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
        ¥ {formatMoney(balanceRaw(d))}
      </Text>

      <Spacer minLength={6 * s} />

      <CapsuleBar
        width={barW} height={5.5 * s} total={10}
        active={getCapsuleActiveCount(settings, d, 10)}
        startColor={getBarColors(settings, getBalanceRatio(settings, d), owe).start}
        endColor={getBarColors(settings, getBalanceRatio(settings, d), owe).end}
      />

      <Spacer />

      <VStack alignment="leading" spacing={3 * s}
        padding={{ top: 6 * s, bottom: 6 * s, leading: 8 * s, trailing: 8 * s }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 8 * s } }}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="gauge.badge.plus" resizable scaleToFit frame={{ width: 11 * s, height: 11 * s }} foregroundStyle={themeColor} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>抄表: {d.lastRecord || "0"} m³</Text>
          <Spacer minLength={2} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>{d._fetchTime || "刚刚"}</Text>
        </HStack>
        <HStack alignment="center" spacing={3}>
          <Image systemName="creditcard" resizable scaleToFit frame={{ width: 11 * s, height: 11 * s }} foregroundStyle={BLUE} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1}>户号: {formatCustCode(settings, d.custCode, true)}</Text>
          <Spacer minLength={2} />
          <Text font={9.5 * s} foregroundStyle={SUB} lineLimit={1} layoutPriority={-1}>{d.custName || "米家山水务"}</Text>
        </HStack>
      </VStack>
    </VStack>
  );
}

/** 中尺寸 */
function MediumView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#FF9500") as Color;
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
      {/* 左列: 标题钉顶、状态行钉底, 余额+进度条在剩余空间垂直居中 */}
      <VStack alignment="leading" spacing={0} frame={{ width: leftW }}>
        <HStack alignment="center" spacing={5}>
          <Image systemName="flame.fill" resizable scaleToFit frame={{ width: 16 * s, height: 16 * s }} foregroundStyle={themeColor} />
          <Text font={13 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{settings.alias || "米家山水务"}</Text>
        </HStack>
        <Spacer />
        <Text font={11 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>{owe ? "水费欠费 (元)" : "可用水费余额 (元)"}</Text>
        <Text font={28 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
          ¥ {formatMoney(balanceRaw(d))}
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
          <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>{owe ? "账户已欠费 · 请及时充值" : "水网连接正常 · 气压稳定"}</Text>
        </HStack>
      </VStack>

      {/* 分割线: 空容器高度为 0, 必须显式给高度 */}
      <VStack spacing={0} frame={{ width: 1, height: Math.round(92 * s) }} background={DIVIDER} />

      {/* 右列 */}
      <VStack alignment="leading" spacing={0}>
        <HStack alignment="center" spacing={3}>
          <Image systemName="arrow.triangle.2.circlepath" resizable scaleToFit frame={{ width: 10 * s, height: 10 * s }} foregroundStyle={SUB} />
          <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>{d._fetchTime ? `更新时间 ${d._fetchTime}` : "实时同步"}</Text>
        </HStack>
        <Spacer />
        <InfoRow icon="person.crop.rectangle" iconColor={themeColor} label="客户户号"
          value={`${d.custName || "--"} (${formatCustCode(settings, d.custCode)})`}
          s={s} valueFont={9.5 * s} labelFont={10 * s} priority={1} />
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
function LargeView({ settings, d, offline, s, displayWidth }: {
  settings: Settings; d: GasData; offline: boolean; s: number; displayWidth: number;
}) {
  const themeColor = (settings.themeColor || "#FF9500") as Color;
  const balanceColor = (settings.balanceColor || "#10B981") as Color;
  const owe = isOwe(d);
  const pX = 16 * s, pY = 14 * s;
  const contentW = Math.max(240, displayWidth - 2 * pX);
  const barW = Math.max(200 * s, contentW - 32 * s);
  const gap = 8 * s;
  const colW = Math.floor((contentW - 2 * gap) / 3);
  const statusCol = owe ? RED : (offline ? themeColor : balanceColor);
  const barColors = getBarColors(settings, getBalanceRatio(settings, d), owe);

  return (
    <VStack alignment="leading" spacing={0}
      padding={{ top: pY, bottom: pY, leading: pX, trailing: pX }}
      widgetBackground={BG}>
      {/* 头部 */}
      <HStack alignment="center" spacing={6}>
        <Image systemName="flame.fill" resizable scaleToFit frame={{ width: 20 * s, height: 20 * s }} foregroundStyle={themeColor} />
        <Text font={15 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{(settings.alias || "米家山水务") + " 在线监控"}</Text>
        <Spacer minLength={4} />
        <Pill s={s} radius={6 * s} color={offline ? themeColor : balanceColor}>
          {offline ? "离线模式" : `更新时间 ${d._fetchTime || "刚刚"}`}
        </Pill>
      </HStack>

      <Spacer />

      {/* 余额主卡 */}
      <VStack alignment="leading" spacing={0}
        padding={{ top: 12 * s, bottom: 12 * s, leading: 16 * s, trailing: 16 * s }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 14 * s } }}>
        <Text font={11.5 * s} fontWeight="medium" foregroundStyle={owe ? RED : SUB}>
          {owe ? "账户欠费总额 (元)" : "当前账户可用水费余额 (元)"}
        </Text>
        <Spacer minLength={3 * s} />
        <Text font={33 * s} fontWeight="bold" foregroundStyle={amountColor(d, balanceColor)} lineLimit={1}>
          ¥ {formatMoney(balanceRaw(d))}
        </Text>
        <Spacer minLength={7 * s} />
        <CapsuleBar width={barW} height={8 * s} total={14}
          active={getCapsuleActiveCount(settings, d, 14)}
          startColor={barColors.start} endColor={barColors.end} />
      </VStack>

      <Spacer />

      {/* 三列状态卡 */}
      <HStack alignment="top" spacing={gap}>
        <VStack alignment="leading" spacing={4 * s} frame={{ width: colW }}
          padding={{ top: 9 * s, bottom: 9 * s, leading: 9 * s, trailing: 9 * s }}
          background={{ style: PILL, shape: { type: "rect", cornerRadius: 10 * s } }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="speedometer" resizable scaleToFit frame={{ width: 12 * s, height: 12 * s }} foregroundStyle={BLUE} />
            <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>上次抄表读数</Text>
          </HStack>
          <Text font={16 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{d.lastRecord || "0"} m³</Text>
        </VStack>

        <VStack alignment="leading" spacing={4 * s} frame={{ width: colW }}
          padding={{ top: 9 * s, bottom: 9 * s, leading: 9 * s, trailing: 9 * s }}
          background={{ style: PILL, shape: { type: "rect", cornerRadius: 10 * s } }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="calendar.badge.clock" resizable scaleToFit frame={{ width: 12 * s, height: 12 * s }} foregroundStyle="#8B5CF6" />
            <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>抄表核算日期</Text>
          </HStack>
          <Text font={13.5 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>{d.lastRecordTime || "近期已核算"}</Text>
        </VStack>

        <VStack alignment="leading" spacing={4 * s} frame={{ width: contentW - 2 * gap - 2 * colW }}
          padding={{ top: 9 * s, bottom: 9 * s, leading: 9 * s, trailing: 9 * s }}
          background={{ style: PILL, shape: { type: "rect", cornerRadius: 10 * s } }}>
          <HStack alignment="center" spacing={3}>
            <Image systemName="waveform.path.ecg" resizable scaleToFit frame={{ width: 12 * s, height: 12 * s }} foregroundStyle={statusCol} />
            <Text font={10 * s} foregroundStyle={SUB} lineLimit={1}>管网监控状态</Text>
          </HStack>
          <HStack alignment="center" spacing={2}>
            <Text font={7 * s} foregroundStyle={statusCol}>●</Text>
            <Text font={12 * s} fontWeight="bold" foregroundStyle={MAIN} lineLimit={1}>
              {owe ? "账户欠费" : (offline ? "离线保持" : "气压稳定")}
            </Text>
          </HStack>
        </VStack>
      </HStack>

      <Spacer />

      {/* 信息列表卡 */}
      <VStack alignment="leading" spacing={6 * s}
        padding={{ top: 10 * s, bottom: 10 * s, leading: 14 * s, trailing: 14 * s }}
        background={{ style: CARD, shape: { type: "rect", cornerRadius: 10 * s } }}>
        <InfoRow icon="person.crop.rectangle" iconColor={themeColor} label="客户姓名" value={d.custName || "--"} s={s} />
        <InfoRow icon="number" iconColor={themeColor} label="水费户号" value={formatCustCode(settings, d.custCode)} s={s} />
        <InfoRow icon="building.2" iconColor="#10B981" label="服务单位" value={formatCompName(settings, d.compName, true)} s={s} />
        <InfoRow icon="phone.badge.waveform" iconColor="#F59E0B" label="客服热线" value={HOTLINE} s={s} />
      </VStack>
    </VStack>
  );
}

/** 引导组件 (未配置凭证) */
function GuideView() {
  return (
    <VStack alignment="center" spacing={4} padding={16} widgetBackground={BG}>
      <Spacer />
      <Text font={15} fontWeight="bold" foregroundStyle="#FF9500">米家山水务</Text>
      <Text font={12} fontWeight="bold" foregroundStyle={MAIN}>未检测到凭证配置</Text>
      <Text font={11} foregroundStyle={SUB}>请点击打开组件，在【账户设置】中输入户号与 token，或使用剪贴板智能解析。</Text>
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

  const configured = (settings.custCode || "").trim() !== "" && (settings.token || "").trim() !== "";

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
