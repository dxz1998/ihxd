// QuantumultX 双流兴能天然气 Cookie捕获脚本
// 匹配域名 wx.shuangliu.gjcode.com
const cookie = $request.headers['Cookie'];
if (cookie) {
    $notify("🔥兴能天然气 CK捕获成功", "wx.shuangliu.gjcode.com", cookie);
    console.log("【兴能天然气CK】\n" + cookie);
}
$done({});
