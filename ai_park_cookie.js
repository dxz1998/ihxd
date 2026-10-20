/*

[rewrite_local]
^https:\/\/app\.cdbost\.cn\/System\/api\/v1\/.* url script-request-header https://raw.githubusercontent.com/dxz1998/ihxd/refs/heads/main/ai_park_cookie.js

[mitm]
hostname = app.cdbost.cn

*/

// AI电管家 (cdboost 停车月卡) 鉴权头捕获 (token/sessionId/signature/nonceStr)
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
    $notify("🅿️AI电管家鉴权头", "Bearer token 已捕获", "token=" + token.slice(0, 40) + "..." + (sessionId ? "\nsessionId=" + sessionId : ""));
    console.log("AIPARK_TOKEN=" + token);
    if (sessionId) console.log("AIPARK_SESSIONID=" + sessionId);
    if (signature) console.log("AIPARK_SIGNATURE=" + signature);
    if (nonceStr) console.log("AIPARK_NONCESTR=" + nonceStr);
}
$done({});
