/*

[mitm]
hostname = wx.shuangliu.qjcode.com

# 双流兴能天然气 捕获token+secret（明文http，无需MITM）
^http:\/\/wx\.shuangliu\.qjcode\.com\/api\/.* url script-request-header https://raw.githubusercontent.com/dxz1998/ihxd/refs/heads/main/gas_cookie.js


*/


// 双流兴能天然气 鉴权头捕获（token/secret/busytoken）
const h = $request.headers;
const token = h['Token'] || h['token'] || '';
const secret = h['Secret'] || h['secret'] || '';
const busytoken = h['Busytoken'] || h['busytoken'] || '';
const openid = h['Openid'] || h['openid'] || '';

if (token || secret) {
    $notify("🔥兴能天然气鉴权头", "token+secret", "token=" + token + "\nsecret=" + secret + "\nbusytoken=" + busytoken);
    console.log("TOKEN=" + token);
    console.log("SECRET=" + secret);
    console.log("BUSYTOKEN=" + busytoken);
    console.log("OPENID=" + openid);
}
$done({});
