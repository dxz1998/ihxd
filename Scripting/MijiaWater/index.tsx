/**
 * 米家山水务 配置页 (index.tsx)
 * 运行入口: 状态展示 / 账户设置 / 显示设置 / 数据操作 / 组件预览
 */
import { useState } from "scripting";
import {
  Script, Navigation, NavigationStack, List, Section,
  Button, Text, Image, HStack, VStack, Toggle, Spacer, Widget,
} from "scripting";
import { type Color, type DynamicShapeStyle } from "scripting";
import { Settings, GasData, loadSettings, saveSettings, loadCache,
  clearCache, fetchGasInfo, defaultSettings,
} from "./store";
import { formatMoney } from "./format";

const SECONDARY: DynamicShapeStyle = { light: "#8A8A8E", dark: "#98989F" };
const GREEN: Color = "#10B981";
const THEME: Color = "#0EA5E9";
const BLUE: Color = "#3B82F6";
const RED: Color = "#EF4444";

/** 原生风格分组标题 */
function SectionHeader({ children }: { children: string }) {
  return <Text font={13} foregroundStyle={SECONDARY}>{children}</Text>;
}

function App() {
  const dismiss = Navigation.useDismiss();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [cache, setCache] = useState<GasData | null>(loadCache);
  const [busy, setBusy] = useState(false);

  // 更新设置并持久化 + 刷新桌面组件
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    Widget.reloadAll();
  };

  // 弹窗输入某个设置项
  const promptSetting = async (
    key: keyof Settings, title: string, message: string, placeholder: string,
    keyboardType?: "numberPad"
  ) => {
    const res = await Dialog.prompt({
      title, message, defaultValue: String(settings[key] ?? ""),
      placeholder, keyboardType,
      confirmLabel: "确定", cancelLabel: "取消",
    });
    if (res !== null) update({ [key]: res.trim() } as Partial<Settings>);
  };

  // 立即刷新 (强制跳过缓存)
  const doRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetchGasInfo(true, settings);
      setCache(r.data);
      Widget.reloadAll();
      if (r.data && !r.offline) {
        await Dialog.alert({
          title: "刷新成功",
          message: `当前余额: ¥ ${formatMoney(r.data.countMoney)}\n上次抄表: ${r.data.lastRecord || "--"} m³ (${r.data.lastRecordTime || "--"})`,
        });
      } else if (r.data && r.offline) {
        await Dialog.alert({
          title: "获取异常",
          message: `在线拉取未成功（${r.error || "未知错误"}），已继续使用离线缓存数据。`,
        });
      } else {
        await Dialog.alert({
          title: "无法获取数据",
          message: r.error || "请检查网络与账户凭证（户号 / token）配置。",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  // 剪贴板一键解析 (抓包 cURL / 请求头)
  const parseClipboard = async () => {
    const paste = await Pasteboard.getString();
    if (!paste || !paste.trim()) {
      await Dialog.alert({
        title: "剪贴板为空",
        message: "请先在 Surge / Loon 等抓包软件中复制请求 cURL 或请求头，再点击此功能。",
      });
      return;
    }
    const str = paste.trim();
    let modified = false;
    const patch: Partial<Settings> = {};

    // 值有效性检测: 拦截代码片段/字面量
    const isJunkValue = (v: string) => {
      if (!v) return true;
      if (v.length < 2 || v.length > 60) return true;
      if (/^(null|undefined|true|false|NaN)$/i.test(v)) return true;
      if (/[=;{}()<>\[\]]/.test(v)) return true;
      if (/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*/.test(v)) return true;
      if (/^[\w$]+\(/.test(v)) return true;
      return false;
    };

    // JWT token (请求头 token 字段)
    const tokenMatch = str.match(/token['":\s=]+([A-Za-z0-9._\-]{20,})/i) ||
      str.match(/\beyJ[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{20,}\.[A-Za-z0-9._\-]{10,}\b/);
    if (tokenMatch && tokenMatch[1]) {
      patch.xMasAppInfo = tokenMatch[1].trim();
      modified = true;
    }

    const custMatch = str.match(/(?:consNo|consno|custCode|custcode)['":\s=]+([0-9]{6,12})/i);
    if (custMatch && custMatch[1]) {
      patch.custCode = custMatch[1].trim();
      modified = true;
    }

    // 户名
    const nameRegex = /(?:consName|consname|custName|custname)['":\s=]+([^'"&\r\n\s]+)/gi;
    let nMatch: RegExpExecArray | null;
    while ((nMatch = nameRegex.exec(str)) !== null) {
      let rawName = nMatch[1].trim();
      try { rawName = decodeURIComponent(rawName); } catch (_) {}
      rawName = rawName.replace(/['"]+$/, "");
      if (!isJunkValue(rawName) && !/^\d+$/.test(rawName)) {
        patch.custName = rawName;
        modified = true;
        break;
      }
    }

    // 服务单位 (必须含中文)
    const compMatch = str.match(/(?:compName|companyName|company|corpName)['":\s=]+([^'"&\r\n]+)/i);
    if (compMatch && compMatch[1]) {
      let rawComp = compMatch[1].trim();
      try { rawComp = decodeURIComponent(rawComp); } catch (_) {}
      rawComp = rawComp.replace(/['"]+$/, "");
      if (!isJunkValue(rawComp) && /[\u4e00-\u9fa5]/.test(rawComp)) {
        patch.customCompName = rawComp;
        modified = true;
      }
    }

    if (modified) {
      const next = { ...settings, ...patch };
      setSettings(next);
      saveSettings(next);
      // 解析成功后立即拉取验证
      setBusy(true);
      let ok = false;
      let data: GasData | null = null;
      try {
        const r = await fetchGasInfo(true, next);
        data = r.data;
        ok = !r.offline && !!r.data;
        setCache(r.data);
        Widget.reloadAll();
      } finally {
        setBusy(false);
      }
      await Dialog.alert({
        title: "凭据解析成功",
        message: [
          `• 水费户号: ${next.custCode || "未找到"}`,
          `• 户名: ${data?.custName || next.custName || "接口自动获取"}`,
          `• 登录凭据: ${next.xMasAppInfo ? "已更新" : "未找到 (沿用内置 token)"}`,
          `• 服务单位: ${data?.compName || next.customCompName || "接口自动获取"}`,
          ok ? `\n✅ 已联网验证，余额 ¥ ${formatMoney(data?.countMoney)}` : "\n⚠️ 联网验证未成功，请检查 token 是否有效",
        ].join("\n"),
      });
    } else {
      await Dialog.alert({
        title: "未识别到米家山水务请求参数",
        message: "未能从剪贴板解析出有效凭据，请确认复制的是 m.cdmjwater.com 的请求（需含 token 请求头）。",
      });
    }
  };

  const showHelpGuide = async () => {
    await Dialog.alert({
      title: "米家山水务抓包指引",
      message: [
        "1. 开启手机抓包软件 (Surge / Loon / Quantumult X)；",
        "2. 打开微信进入【米家山水务】小程序并点击查询或我的；",
        "3. 筛选主机包含 m.cdmjwater.com 的请求；",
        "4. 复制该请求的 cURL 或请求头（需含 token 请求头）；",
        "5. 返回此处点击【剪贴板一键智能解析】即可全自动填入。",
      ].join("\n\n"),
    });
  };

  const previewWidget = async () => {
    const idx = await Dialog.actionSheet({
      title: "选择要预览的组件尺寸",
      actions: [{ label: "小号 (systemSmall)" }, { label: "中号 (systemMedium)" }, { label: "大号 (systemLarge)" }],
    });
    if (idx == null) return;
    const family = (["systemSmall", "systemMedium", "systemLarge"] as const)[idx];
    await Widget.preview({ family });
  };

  const doClearCache = async () => {
    const ok = await Dialog.confirm({
      title: "清除缓存", message: "将清空本地所有水费历史缓存数据。确定清除吗？",
      confirmLabel: "确认清除", cancelLabel: "取消",
    });
    if (ok) {
      clearCache();
      setCache(null);
      Widget.reloadAll();
      await Dialog.alert({ title: "清除成功", message: "缓存已清空，小组件将在下次刷新时重新拉取。" });
    }
  };

  const doResetDisplay = async () => {
    const ok = await Dialog.confirm({
      title: "重置显示配置",
      message: "确定将所有显示配置（渐变色、脱敏、主题色、满额基准等）恢复为初始默认值吗？",
      confirmLabel: "确认重置", cancelLabel: "取消",
    });
    if (ok) {
      const d = defaultSettings();
      update({
        useGradientBar: d.useGradientBar, themeColor: d.themeColor,
        balanceColor: d.balanceColor, maskCustCode: d.maskCustCode,
        maskCompName: d.maskCompName, balanceLimit: d.balanceLimit,
      });
      await Dialog.alert({ title: "重置成功", message: "显示配置已恢复为默认状态！" });
    }
  };

  // 通用设置行
  const row = (
    icon: string, color: Color, title: string, desc: string,
    value: string | undefined, onTap: () => void
  ) => (
    <Button action={onTap}>
      <HStack alignment="center" spacing={12}>
        <Image systemName={icon} resizable scaleToFit frame={{ width: 24, height: 24 }} foregroundStyle={color} />
        <VStack alignment="leading" spacing={2}>
          <Text font={16}>{title}</Text>
          <Text font={12} foregroundStyle={SECONDARY}>{desc}</Text>
        </VStack>
        <Spacer />
        {value !== undefined ? (
          <Text font={13} foregroundStyle={SECONDARY} lineLimit={1}>{value}</Text>
        ) : null}
      </HStack>
    </Button>
  );

  const d = cache;
  const owe = !!d && !!d.oweMoney && parseFloat(String(d.oweMoney)) > 0;

  return (
    <NavigationStack>
      <List
        navigationTitle="米家山水务"
        navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="关闭" action={dismiss} /> }}
      >
        <Section
          header={<SectionHeader>当前状态</SectionHeader>}
          footer={<Text font={12} foregroundStyle={SECONDARY}>小组件与配置页共享同一份缓存；「刷新间隔」内重复打开不会重复联网。</Text>}>
          {d ? (
            <>
              <HStack alignment="center" spacing={12}>
                <Image systemName="drop.fill" resizable scaleToFit frame={{ width: 24, height: 24 }} foregroundStyle={THEME} />
                <Text font={15}>{owe ? "账户欠费" : "账户余额"}</Text>
                <Spacer />
                <Text font={22} fontWeight="bold" foregroundStyle={owe ? RED : GREEN} lineLimit={1}>
                  ¥ {formatMoney(d.countMoney)}
                </Text>
              </HStack>
              <HStack alignment="center" spacing={12}>
                <Image systemName="speedometer" resizable scaleToFit frame={{ width: 24, height: 24 }} foregroundStyle={BLUE} />
                <Text font={15}>上次抄表</Text>
                <Spacer />
                <Text font={15} fontWeight="semibold" lineLimit={1}>
                  {d.lastRecord || "0"} m³ · {d.lastRecordTime || "--"}
                </Text>
              </HStack>
              <HStack alignment="center" spacing={12}>
                <Image systemName="clock.arrow.circlepath" resizable scaleToFit frame={{ width: 24, height: 24 }} foregroundStyle={SECONDARY} />
                <Text font={15}>数据更新于</Text>
                <Spacer />
                <Text font={15} fontWeight="semibold">{d._fetchTime || "--"} ({d._fetchDate || "--"})</Text>
              </HStack>
              <HStack alignment="center" spacing={12}>
                <Image systemName="person.crop.rectangle" resizable scaleToFit frame={{ width: 24, height: 24 }} foregroundStyle={SECONDARY} />
                <Text font={15}>客户 / 户号</Text>
                <Spacer />
                <Text font={15} fontWeight="semibold" lineLimit={1}>
                  {d.custName || "--"} · {d.custCode || "--"}
                </Text>
              </HStack>
            </>
          ) : (
            <Text foregroundStyle={SECONDARY} font={14}>暂无缓存数据，点击下方「立即刷新」联网拉取。</Text>
          )}
        </Section>

        <Section
          header={<SectionHeader>账户设置</SectionHeader>}
          footer={<Text font={12} foregroundStyle={SECONDARY}>登录凭证为小程序请求头中的 JWT token；未填写时沿用脚本内置 token。</Text>}>
          {row("questionmark.circle", BLUE, "抓包指引与帮助", "如何获取米家山水务凭证", undefined, showHelpGuide)}
          {row("doc.on.clipboard", GREEN, "剪贴板一键智能解析", "复制抓包请求后点击自动提取参数", undefined, parseClipboard)}
          {row("message.fill", "#07C160", "快捷打开微信", "跳转微信打开米家山水务小程序", undefined, async () => {
            await Safari.openURL("weixin://");
          })}
          {row("number", THEME, "水费户号 (custCode)", "9 位水费客户编号", settings.custCode || "未配置", () =>
            promptSetting("custCode", "水费户号", "请输入 9 位水费客户编号 (如 121338748)", "121338748", "numberPad"))}
          {row("person.crop.rectangle", "#8B5CF6", "客户姓名 (custName)", "留空则由接口自动获取", settings.custName || "自动获取", () =>
            promptSetting("custName", "客户姓名", "请输入客户姓名", "董鑫周"))}
          {row("building.2.fill", GREEN, "服务单位 (compName)", "留空则由接口自动获取", settings.customCompName || "自动获取", () =>
            promptSetting("customCompName", "服务单位", "请输入实际所属服务单位", "成都市岷江自来水厂"))}
          {row("key.fill", "#EC4899", "登录凭证 (token)", "抓包请求头中的完整 JWT (eyJ... 开头)", settings.xMasAppInfo ? "已配置" : "未配置 (用内置 token)", () =>
            promptSetting("xMasAppInfo", "登录凭证 (token)", "请粘贴抓包中的完整 JWT token", "eyJhbGciOi..."))}
          {row("tag.fill", THEME, "组件别名", "小组件标题显示名", settings.alias || "米家山水务", () =>
            promptSetting("alias", "组件别名", "如：我家水费、父母家、店面", "我家水费"))}
        </Section>

        <Section header={<SectionHeader>显示设置</SectionHeader>}>
          <Toggle title="进度条余额渐变色" value={settings.useGradientBar} onChanged={v => update({ useGradientBar: v })} />
          {row("paintpalette.fill", THEME, "品牌强调色 (单色)", "关闭渐变色时生效", settings.themeColor, () =>
            promptSetting("themeColor", "品牌强调色", "请输入十六进制颜色 (如 #FF9500)", "#FF9500"))}
          {row("drop.fill", GREEN, "余额充沛主题色", "余额文字与状态色", settings.balanceColor, () =>
            promptSetting("balanceColor", "余额充沛主题色", "请输入十六进制颜色 (如 #10B981)", "#10B981"))}
          <Toggle title="户号脱敏 (512****03)" value={settings.maskCustCode} onChanged={v => update({ maskCustCode: v })} />
          <Toggle title="服务单位脱敏 (显示为「米家山水务」)" value={settings.maskCompName} onChanged={v => update({ maskCompName: v })} />
          {row("number.square.fill", BLUE, "满额基准额度 (元)", "进度条 100% 对应的金额", settings.balanceLimit, () =>
            promptSetting("balanceLimit", "满额基准额度", "进度条 100% 对应的金额基准", "500", "numberPad"))}
        </Section>

        <Section
          header={<SectionHeader>数据与操作</SectionHeader>}
          footer={<Text font={12} foregroundStyle={SECONDARY}>修改任何设置后，桌面小组件会立即请求刷新。</Text>}>
          {row("arrow.clockwise", THEME, busy ? "刷新中…" : "立即刷新", "强制跳过缓存间隔，联网拉取最新数据", undefined, doRefresh)}
          {row("rectangle.on.rectangle", BLUE, "预览小组件", "在小 / 中 / 大三种尺寸间预览", undefined, previewWidget)}
          {row("clock.arrow.circlepath", BLUE, "刷新间隔 (分钟)", "数据读取间隔，默认 360 分钟", settings.interval + " 分钟", () =>
            promptSetting("interval", "刷新间隔 (分钟)", "数据刷新时间，单位：分钟", "360", "numberPad"))}
          {row("trash", RED, "清除缓存", "清空本地所有历史缓存数据", undefined, doClearCache)}
          {row("arrow.counterclockwise", RED, "重置显示配置", "恢复渐变色 / 脱敏 / 主题色为默认值", undefined, doResetDisplay)}
        </Section>

        <Section>
          <Text font={11} foregroundStyle={SECONDARY} frame={{ maxWidth: Infinity, alignment: "center" }}>
            米家山水务 v1.8.3 · Scripting 移植版
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

async function run() {
  await Navigation.present(<App />);
  Script.exit();
}

run();
