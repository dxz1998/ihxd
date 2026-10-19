// QuantumultX 双流兴能天然气 CK捕获【本地版】
const cookie = $request.headers['Cookie'];
if (cookie) {
    $notify("🔥兴能天然气 CK捕获成功", "wx.shuangliu.gjcode.com", cookie);
    console.log("【兴能天然气CK】\n" + cookie);
} else {
    $notify("⚠️请求命中，但是无Cookie");
}
$done({});
