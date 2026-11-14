const fs = require('node:fs');
const path = require('node:path');
// 廃止したエントリーや移動したモジュールの生成物を配布物へ残さない。
fs.rmSync(path.resolve(__dirname, '..', 'dist'), { recursive: true, force: true });
