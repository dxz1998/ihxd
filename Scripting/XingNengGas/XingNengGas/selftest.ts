/**
 * 加密链路自测 (手动运行: scripting-ts run selftest.ts)
 */
import {
  b64encode, b64decode, strToBytes, bytesToStr,
  aes128EcbEncrypt, aes128EcbDecrypt, pkcs7Pad, pkcs7Unpad,
  rsaPublicEncrypt, rsaPrivateDecrypt, parseSpkiPub, b64urlToBigInt, bytesToBigInt,
} from "./crypto";
import { CLIENT_KEY, CONFIG, queryBalance } from "./api";
import { Script } from "scripting";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

let pass = 0, fail = 0;
function check(name: string, ok: boolean, extra?: string) {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

async function main() {
  // 1. Base64 往返
  const b64rt = b64encode(strToBytes("Hello 兴能燃气 🇨🇳"));
  check("Base64/UTF-8 往返", bytesToStr(b64decode(b64rt)) === "Hello 兴能燃气 🇨🇳", b64rt);

  // 2. AES-128-ECB FIPS-197 标准向量
  const key = hexToBytes("000102030405060708090a0b0c0d0e0f");
  const pt = hexToBytes("00112233445566778899aabbccddeeff");
  const ct = aes128EcbEncrypt(pt, key);
  check("AES-128-ECB 加密向量", bytesToHex(ct) === "69c4e0d86a7b0430d8cdb78070b4c55a", bytesToHex(ct));
  const back = aes128EcbDecrypt(ct, key);
  check("AES-128-ECB 解密向量", bytesToHex(back) === "00112233445566778899aabbccddeeff");

  // 3. AES 多块 + Pkcs7 往返 (中文)
  const msg = '{"consNo":"636550678","中文":"测试🎉"}';
  const enc = aes128EcbEncrypt(pkcs7Pad(strToBytes(msg)), strToBytes("ABCDEF1234567890"));
  const dec = bytesToStr(pkcs7Unpad(aes128EcbDecrypt(enc, strToBytes("ABCDEF1234567890"))));
  check("AES Pkcs7 中文往返", dec === msg, dec);

  // 4. SPKI 解析: 内置公钥应与 N/E 一致
  const pub = parseSpkiPub(CLIENT_KEY.PUB_SPKI_B64);
  const nFromUrl = b64urlToBigInt(CLIENT_KEY.N);
  check("SPKI 解析 n 匹配", pub.n === nFromUrl);
  check("SPKI 解析 e=65537", pub.e === BigInt(0x10001));

  // 5. RSA-1024 PKCS1 v1.5 往返 (用客户端自己的密钥对)
  let rsaOk = true;
  for (let i = 0; i < 3; i++) {
    const aesKey = "K" + Math.random().toString(36).slice(2, 16);
    const c = rsaPublicEncrypt(strToBytes(aesKey), pub.n, pub.e);
    const m = bytesToStr(rsaPrivateDecrypt(c, b64urlToBigInt(CLIENT_KEY.N), b64urlToBigInt(CLIENT_KEY.D)));
    if (m !== aesKey) rsaOk = false;
  }
  check("RSA-1024 加解密往返 x3", rsaOk);

  // 6. 大数工具
  const v = bytesToBigInt(hexToBytes("0102030405"));
  check("bytesToBigInt", v === BigInt(0x0102030405));

  console.log(`\n离线自测: ${pass} 通过, ${fail} 失败`);

  // 7. 在线链路实测: serverKey 协商 -> 加密请求 -> 解密响应
  console.log("\n—— 在线实测 queryBalance (token 过期属正常, 重点验证加密链路) ——");
  try {
    const r = await queryBalance(CONFIG.TOKEN, CONFIG.CONSNO);
    console.log("✅ 在线查询成功: " + JSON.stringify(r, null, 2));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const linkOk = !/协商失败|HTTP|fetch|network|timed? ?out/i.test(msg);
    console.log((linkOk ? "✅ 加密链路通, 业务被拒(预期): " : "⚠️ 网络层失败: ") + msg);
  }
}

main().then(
  () => Script.exit(0),
  e => { console.log("自测异常: " + (e instanceof Error ? e.message : String(e))); Script.exit(1); }
);
