/*

[rewrite_local]
^https:\/\/m\.cdmjwater\.com\/api\/.* url script-request-header https://raw.githubusercontent.com/dxz1998/ihxd/refs/heads/main/water.js

[mitm]
hostname = m.cdmjwater.com

*/


// 成都米家山水务 (成都环境集团) 鉴权头捕获 (token/secret/busytoken)
// 注意: 水厂为 HTTPS, 需开启 Quantumult X 的 HTTPS 解密 (证书安装 + MITM 开关)
const h = $request.headers;
const token = h['Token'] || h['token'] || '';
const secret = h['Secret'] || h['secret'] || '';
const busytokenRaw = h['BusyToken'] || h['busytoken'] || '';
const busytoken = busytokenRaw.replace(/^busy_token:\s*/i, '');
const openid = h['Openid'] || h['openid'] || '';
const fromDomainId = h['FromDomainId'] || h['fromdomainid'] || '';

if (token || secret) {
    $notify("💧米家山水务鉴权头", "token+secret+busyToken", "token=" + token + "\nsecret=" + secret + "\nbusyToken=" + busytoken);
    console.log("TOKEN=" + token);
    console.log("SECRET=" + secret);
    console.log("BUSYTOKEN=" + busytoken);
    console.log("OPENID=" + openid);
    console.log("FROMDOMAINID=" + fromDomainId);
}
$done({});
