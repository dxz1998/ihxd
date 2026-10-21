/**
 * 米家山水务 账户设置页 (index.tsx)
 * 在 Scripting app 里直接运行: 填写/解析凭证 → 保存 → 刷新桌面小组件
 */
import { useState, NavigationStack, List, Section, HStack, VStack, Text, TextField, Toggle, Button, Script, Widget, Pasteboard, Navigation } from "scripting";
import { Settings, loadSettings, saveSettings, fetchGasInfo, parseClipboard } from "./store";
import { formatMoney } from "./format";

function SettingsView() {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState("就绪");
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS(prev => ({ ...prev, [k]: v }));

  const paste = async () => {
    const text = await Pasteboard.getString();
    if (!text) { setStatus("剪贴板为空"); return; }
    const parsed = parseClipboard(text);
    const keys = Object.keys(parsed);
    if (keys.length === 0) { setStatus("未识别出米家山水务请求参数"); return; }
    setS(prev => ({ ...prev, ...parsed }));
    setStatus(`已解析: ${keys.join(", ")}`);
  };

  const save = () => {
    saveSettings(s);
    Widget.reloadAll();
    setStatus("已保存并刷新桌面小组件");
  };

  const test = async () => {
    setTesting(true);
    setStatus("正在请求接口…");
    try {
      const { data, offline } = await fetchGasInfo(true, s);
      if (!data) setStatus("请求成功但未解析到余额");
      else if (offline) setStatus(`接口失败, 使用缓存: ¥ ${formatMoney(data.countMoney ?? data.newCountMoney)}`);
      else setStatus(`请求成功, 余额 ¥ ${formatMoney(data.countMoney ?? data.newCountMoney)}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <NavigationStack>
      <List navigationTitle="米家山水务 · 账户设置">
        <Section
          header={<Text>账户凭证 (抓包获取)</Text>}
          footer={<Text>在微信进入【米家山水务】小程序, 用 Surge / Loon 抓包筛选 m.cdmjwater.com 的请求, 复制 cURL 或请求头 (需含 token), 点「剪贴板一键智能解析」。</Text>}
        >
          <TextField title="水费户号 (consNo)" value={s.custCode} onChanged={v => set("custCode", v)} prompt="如 121338748" />
          <TextField title="登录凭证 (token)" value={s.token} onChanged={v => set("token", v)} prompt="eyJ... 开头的 JWT" />
          <TextField title="客户姓名 (可选)" value={s.custName} onChanged={v => set("custName", v)} prompt="接口失败时兜底显示" />
          <Button action={paste}>
            <HStack>
              <Text>📋 剪贴板一键智能解析</Text>
            </HStack>
          </Button>
        </Section>

        <Section header={<Text>显示</Text>}>
          <TextField title="组件别名" value={s.alias} onChanged={v => set("alias", v)} prompt="米家山水务" />
          <Toggle title="进度条五色阶渐变" value={s.useGradientBar} onChanged={v => set("useGradientBar", v)} />
          <TextField title="主题色 (单色进度条)" value={s.themeColor} onChanged={v => set("themeColor", v)} prompt="#FF9500" />
          <TextField title="余额充沛色 (渐变顶端)" value={s.balanceColor} onChanged={v => set("balanceColor", v)} prompt="#10B981" />
          <TextField title="满额基准额度 (元)" value={s.balanceLimit} onChanged={v => set("balanceLimit", v)} prompt="500" />
          <Toggle title="户号脱敏 (636****78)" value={s.maskCustCode} onChanged={v => set("maskCustCode", v)} />
          <Toggle title="服务单位脱敏" value={s.maskCompName} onChanged={v => set("maskCompName", v)} />
          <TextField title="自定义服务单位" value={s.customCompName} onChanged={v => set("customCompName", v)} prompt="默认: 成都市岷江自来水厂" />
        </Section>

        <Section header={<Text>刷新</Text>} footer={<Text>组件实际刷新由系统调度, 间隔过短会被节流, 建议 ≥60 分钟。</Text>}>
          <TextField title="刷新间隔 (分钟)" value={s.interval} onChanged={v => set("interval", v)} prompt="360" />
        </Section>

        <Section>
          <Button action={test}>
            <Text>{testing ? "测试中…" : "🔌 测试接口"}</Text>
          </Button>
          <Button action={save}>
            <Text fontWeight="bold">💾 保存并刷新小组件</Text>
          </Button>
        </Section>

        <Section>
          <Text font={12} foregroundStyle="#6B7280">{status}</Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

async function main() {
  Navigation.present({ element: <SettingsView /> });
  Script.exit();
}

main().catch(e => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  Script.exit();
});
