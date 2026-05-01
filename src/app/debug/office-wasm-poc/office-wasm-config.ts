export const OFFICE_WASM_ASSET_ROUTE = "/api/debug/office-wasm-poc/assets";

export const OFFICE_WASM_TMP_ASSET_DIR =
  "tmp/codex-app-analysis/extracted/webview/assets";

export const OFFICE_WASM_ARTIFACT_TAB_BUNDLE =
  "artifact-tab-content.electron-DmcFg9h8.js";

export const OFFICE_WASM_READER_MODULES = {
  workbook: "workbook-CJ5j_l1F.js",
  document: "document-BOb5tmtr.js",
  presentation: "presentation-DFBGauUV.js",
  spreadsheet: "spreadsheet-Bpv2Ypgr.js",
  dotnet: "dotnet.js",
} as const;

export const OFFICE_WASM_READER_ABI = [
  "ExtractDocxProto",
  "ExtractSlidesProto",
  "ExtractXlsxProto",
  "fromCSV",
] as const;

export const OFFICE_WASM_PANEL_CONTRACT = [
  "PopcornElectronDocumentPanel",
  "PopcornElectronPresentationPanel",
  "PopcornElectronWorkbookPanel",
] as const;

export const OFFICE_WASM_DOTNET_RUNTIME_CONFIG = {
  mainAssemblyName: "Walnut",
  resources: {
    hash: "sha256-nthLaJwzw0DLDlI4ECh68ZKXvDRJH9Jlg9yZFd3C0+0=",
    fingerprinting: {
      "DocumentFormat.OpenXml.Framework.kpj7t3qucf.wasm": "DocumentFormat.OpenXml.Framework.wasm",
      "DocumentFormat.OpenXml.ie8f746kzt.wasm": "DocumentFormat.OpenXml.wasm",
      "Google.Protobuf.ze35jf5cfr.wasm": "Google.Protobuf.wasm",
      "System.Collections.Concurrent.ifkyiyawwo.wasm": "System.Collections.Concurrent.wasm",
      "System.Collections.NonGeneric.7lsghwy4oa.wasm": "System.Collections.NonGeneric.wasm",
      "System.Collections.Specialized.4ycmsxi9r1.wasm": "System.Collections.Specialized.wasm",
      "System.Collections.53wkt3rjnm.wasm": "System.Collections.wasm",
      "System.ComponentModel.Primitives.755z3qfw43.wasm": "System.ComponentModel.Primitives.wasm",
      "System.ComponentModel.TypeConverter.yj8s8mxecj.wasm": "System.ComponentModel.TypeConverter.wasm",
      "System.ComponentModel.5keg7c7hvo.wasm": "System.ComponentModel.wasm",
      "System.Console.wafck6z1ot.wasm": "System.Console.wasm",
      "System.Diagnostics.DiagnosticSource.qcda27aixf.wasm": "System.Diagnostics.DiagnosticSource.wasm",
      "System.IO.Compression.tcn9zdeat6.wasm": "System.IO.Compression.wasm",
      "System.IO.Packaging.ejb20qp7p2.wasm": "System.IO.Packaging.wasm",
      "System.Linq.Expressions.z7qevklcuo.wasm": "System.Linq.Expressions.wasm",
      "System.Linq.5ehom0dfm3.wasm": "System.Linq.wasm",
      "System.Memory.282wmwiloz.wasm": "System.Memory.wasm",
      "System.Net.Http.ubki69uxiv.wasm": "System.Net.Http.wasm",
      "System.Net.Primitives.6xdadyjvop.wasm": "System.Net.Primitives.wasm",
      "System.ObjectModel.t3toc9pme6.wasm": "System.ObjectModel.wasm",
      "System.Private.CoreLib.5knuccmsyn.wasm": "System.Private.CoreLib.wasm",
      "System.Private.Uri.ai39t9vkqf.wasm": "System.Private.Uri.wasm",
      "System.Private.Xml.Linq.6s0uf1018j.wasm": "System.Private.Xml.Linq.wasm",
      "System.Private.Xml.hdgz58vruv.wasm": "System.Private.Xml.wasm",
      "System.Runtime.InteropServices.JavaScript.gfj68pelgx.wasm": "System.Runtime.InteropServices.JavaScript.wasm",
      "System.Security.Cryptography.olbng0qvbw.wasm": "System.Security.Cryptography.wasm",
      "System.Text.RegularExpressions.g9hkuzbacr.wasm": "System.Text.RegularExpressions.wasm",
      "System.dqfxtvioy0.wasm": "System.wasm",
      "System.Xml.Linq.53liyo777g.wasm": "System.Xml.Linq.wasm",
      "Walnut.nvqhqmqbjk.wasm": "Walnut.wasm",
      "dotnet.native.lo0npp77z5.js": "dotnet.native.js",
      "dotnet.native.wfd2lrj4w6.wasm": "dotnet.native.wasm",
      "dotnet.js": "dotnet.js",
      "dotnet.runtime.2hocyfcbj2.js": "dotnet.runtime.js",
    },
    coreAssembly: {
      "System.Private.CoreLib.5knuccmsyn.wasm":
        "sha256-xW5hrHA6AE48YHx+xPosdCWVIRPpe6JZCzvZUjyVn0M=",
      "System.Runtime.InteropServices.JavaScript.gfj68pelgx.wasm":
        "sha256-JCwSVA4cvnawhikg5QrH9v9qgJy9JhQ54c9ozskI1TU=",
    },
    assembly: {
      "DocumentFormat.OpenXml.Framework.kpj7t3qucf.wasm":
        "sha256-iKgX/t4htZRMlxVH9LwO6f/Ec3KPIVp2h2cIwo98rPA=",
      "DocumentFormat.OpenXml.ie8f746kzt.wasm":
        "sha256-Si+3lLPkTJZezvnYEt8jyLDojLOdVNVVRj41Ug/rvt4=",
      "Google.Protobuf.ze35jf5cfr.wasm":
        "sha256-i38brCJSYmpsUEG3n34uEuDFfLxkrlECq4wIOMlpBiY=",
      "System.Collections.Concurrent.ifkyiyawwo.wasm":
        "sha256-7lW+NLtsu49ATDYcB5SlUff5W7owPd+P6+BpkhLdSfs=",
      "System.Collections.NonGeneric.7lsghwy4oa.wasm":
        "sha256-u0XN4uYg5bc7p87OH/yoU0PnSlyfk1fYALMrZUkQo+w=",
      "System.Collections.Specialized.4ycmsxi9r1.wasm":
        "sha256-DAtbHJ2BaNNEYcCPAqPqFGmTMvoepPTF5xFhr8pytAA=",
      "System.Collections.53wkt3rjnm.wasm":
        "sha256-j4f129c/j4DookwnUWH6hTwYbQp33vNTdcjMRKPcANM=",
      "System.ComponentModel.Primitives.755z3qfw43.wasm":
        "sha256-NYBL6jJ7FS/K4pf72MDV62DBx0F7bt/0LE3L4fs3QJ8=",
      "System.ComponentModel.TypeConverter.yj8s8mxecj.wasm":
        "sha256-sjU0251V9fjU4kTZUYqV6h7N8g1Vj4qdyDaNKhFUkAk=",
      "System.ComponentModel.5keg7c7hvo.wasm":
        "sha256-tXQpmMVs+QJaYRESF8C5FLZYQNMLjOvszNCASM8imFM=",
      "System.Console.wafck6z1ot.wasm":
        "sha256-eLTiR09j8C03D1vA21KQQHHbpnmxfQ5l25AIzcJH680=",
      "System.Diagnostics.DiagnosticSource.qcda27aixf.wasm":
        "sha256-GkDZe9IrZyEIoePwXI5DL632BPCuBwbTIxF306/vzAM=",
      "System.IO.Compression.tcn9zdeat6.wasm":
        "sha256-g2rHNXKLuGvHVgE4Miz9ZYq5M825yEc1EUa3gzX6/Mw=",
      "System.IO.Packaging.ejb20qp7p2.wasm":
        "sha256-FmH8uRx5Ltr4iImKrvn8KFhC0qZ863olZEkXoHrw1Ak=",
      "System.Linq.Expressions.z7qevklcuo.wasm":
        "sha256-PxvPQLhX8OxkSQT4SLJePkuPteXKOnWJ7DZgiSxDCbs=",
      "System.Linq.5ehom0dfm3.wasm":
        "sha256-DdSA4XcQzPM5YhXdWmWZ2RAC7F7OdAmokuew4U7ktC4=",
      "System.Memory.282wmwiloz.wasm":
        "sha256-QomNkxE9OswXieyOLECxAN87ums92aVNNhOyhXEFyzM=",
      "System.Net.Http.ubki69uxiv.wasm":
        "sha256-auH+MfKSO8hjI0mrD5PXYyiuCdw7XFbdLp45+mo9t1s=",
      "System.Net.Primitives.6xdadyjvop.wasm":
        "sha256-+kmyKoOgAl1MlZc+bDX6/ZO1+B+ZPkF8nEdNCX5YJMg=",
      "System.ObjectModel.t3toc9pme6.wasm":
        "sha256-WQn9YQxastp2Skfly9YmBm55DaBYUN6MXhUHHTnHAww=",
      "System.Private.Uri.ai39t9vkqf.wasm":
        "sha256-AmvTJBkUj5FZt3drMntF5sBVvXwFE3OGU3y56KNc63c=",
      "System.Private.Xml.Linq.6s0uf1018j.wasm":
        "sha256-ik0dKEgLPdS3E6/IdOb9zl2iXp0DEvkag+wOpX6ciPo=",
      "System.Private.Xml.hdgz58vruv.wasm":
        "sha256-W82TrVHm5COWSgDZGupAbx68jTqJY10Itb0bylnp2aU=",
      "System.Security.Cryptography.olbng0qvbw.wasm":
        "sha256-hPXoWj3KRSHLC8vFk69ZEgRp8kh1HJKw/+pnu3xEs88=",
      "System.Text.RegularExpressions.g9hkuzbacr.wasm":
        "sha256-ZA7ApPg7tHJDQMQk5KUfTYIuCngfBuYyD+ycRtY9nck=",
      "System.dqfxtvioy0.wasm":
        "sha256-5QZAjy4n7513fYxCXSXTsAkUmRsLiZ8m621Ot4k7FB0=",
      "System.Xml.Linq.53liyo777g.wasm":
        "sha256-v9JHsJbBkO3lHVBoE7qJxiS0WfQzkxg+A8GpOWF+ls8=",
      "Walnut.nvqhqmqbjk.wasm":
        "sha256-U3TIKatBL+JhvqCtgaTsjuN+tbqQkDzjpxIadWA42Zo=",
    },
    jsModuleNative: {
      "dotnet.native.lo0npp77z5.js":
        "sha256-NVCP8hmLbuBAcDPJqCIgsE34NzdDSrQ9g816vUcMga4=",
    },
    jsModuleRuntime: {
      "dotnet.runtime.2hocyfcbj2.js":
        "sha256-5oRcSUQSLbUYyq9jPgwB6domrDHYrvLX+53QxY+0y48=",
    },
    wasmNative: {
      "dotnet.native.wfd2lrj4w6.wasm":
        "sha256-dJ41jB4EfM+g1yh0aKIDYjjCxeaUDqKqaMIh2L4ScTE=",
    },
  },
  debugLevel: 0,
  linkerEnabled: true,
  globalizationMode: "invariant",
} as const;

export default {
  OFFICE_WASM_ARTIFACT_TAB_BUNDLE,
  OFFICE_WASM_ASSET_ROUTE,
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
  OFFICE_WASM_PANEL_CONTRACT,
  OFFICE_WASM_READER_ABI,
  OFFICE_WASM_READER_MODULES,
  OFFICE_WASM_TMP_ASSET_DIR,
};
