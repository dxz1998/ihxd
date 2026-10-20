/*

[rewrite_local]
^https:\/\/app\.cdbost\.cn\/System\/api\/v1\/.* url script-request-header https://raw.githubusercontent.com/dxz1998/ihxd/refs/heads/main/ai_park_cookie.js

[mitm]
hostname = app.cdbost.cn

*/

// AI电管家 (cdboost 停车月卡) 鉴权头捕获 v2
// - 自动保存到 QX 持久化存储 ($preference), 重启不丢
// - 通知展示完整 token, 长按可复制
// - 仅在 token 变化时才通知, 避免刷屏
// 注意: cdbost 为 HTTPS, 需开启 Quantumult X 的 HTTPS 解密 (证书安装 + MITM 开关)
const h = $request.headers || {};
const url = $request.url || '';

// Authorization: Bearer <JWT> — 登录凭据
const authRaw = h['Authorization'] || h['authorization'] || '';
const authM = authRaw.match(/Bearer\s+(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
const token = authM ? authM[1] : '';

// 其他辅助头
const sessionId = h['SessionId'] || h['sessionid'] || h['sessionId'] || '';
const signature = h['Signature'] || h['signature'] || '';
const nonceStr = h['NonceStr'] || h['noncestr'] || '';

if (token) {
    // 与上次捕获的对比, 只在新 token 时通知
    const lastToken = $preference.valueForKey('AIPark_Token') || '';
    const isNew = (token !== lastToken);

    // 持久化保存全部鉴权参数
    $preference.setValueForKey(token, 'AIPark_Token');
    if (sessionId) $preference.setValueForKey(sessionId, 'AIPark_SessionId');
    if (signature) $preference.setValueForKey(signature, 'AIPark_Signature');
    if (nonceStr) $preference.setValueForKey(nonceStr, 'AIPark_NonceStr');

    // 完整日志 (QX 脚本日志可查)
    console.log("AIPARK_TOKEN=" + token);
    if (sessionId) console.log("AIPARK_SESSIONID=" + sessionId);
    if (signature) console.log("AIPARK_SIGNATURE=" + signature);
    if (nonceStr) console.log("AIPARK_NONCESTR=" + nonceStr);

    // 通知: 完整 token 便于长按复制, 已保存标记
    $notify("🅿️AI电管家 token 已捕获" + (isNew ? " (新)" : " (重复)"), "已保存到 QX · 可长按复制", token + (sessionId ? "\nsessionId: " + sessionId : ""));
} else if (url.indexOf('/System/api/v1/') >= 0) {
    // 命中接口但未找到 Bearer 头: 提示可能漏抓 (如未开 MITM 或复制了无鉴权请求)
    console.log("AIPARK_NOTE: 命中 cdbost 请求但无 Authorization: Bearer 头, 请检查 MITM 是否开启");
}
$done({});
