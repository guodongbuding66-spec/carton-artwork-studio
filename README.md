# Carton Artwork Studio

在线唛头 / 外箱印刷稿自动化系统。

当前仓库处于 **Phase 0 / Phase 1 工程原型**。产品目标不是通用设计软件，而是：

> Canonical Data → Rule Engine → Parametric mm Geometry → Vector Renderer → Preflight → Review → Production

## 当前版本：0.3.0

### 已实现

- 7 个主模块：工作台、印刷稿、批量生成、模板、内容资料、质量检查、系统管理
- 美线侧封箱 `US_SIDE_SEAL / 2026.05.20`
- Canonical Artwork Data
- Factory → CRN / Country 单一数据源联动
- CRN 两处同步绑定
- 多包裹提示规则
- Package Meas 自动计算
- 250×80 / 200×64 mm 锁定 CodeBlock
- 参数化真实 mm Side-Seal Geometry
- 源 PDF 200 mm 矢量校准数据
- SVG 技术预览
- Data / Layout / Codes / Print 四类实时 Preflight
- **真实 Code 128-B 矢量编码 + checksum + quiet zone**
- **真实 QR Version 4-L Byte-mode 编码 + Reed-Solomon ECC + 自动 mask 选择**
- Browser `BarcodeDetector` 可用时支持“矢量 → 栅格 → 重新解码”数字验证
- **1:1 mm Vector PDF Renderer**
- Proof PDF 含 `NOT FOR PRODUCTION`
- Production PDF 为 K-only 黑色矢量对象
- Approved + 0 blocking errors 才允许 Production Bundle
- Production Bundle：PDF / SVG / Snapshot / Preflight / SHA-256 Manifest
- **零依赖 `.xlsx` / `.csv` Import Engine**
- XLSX ZIP/Deflate 解压、Shared Strings、Worksheet 读取
- 自动 Header Detection + 字段 Alias
- 重复中英文/重复表头跳过
- `TOTAL / SUBTOTAL / 合计 / 总计` Footer Stop
- Fill Down
- Formula 无缓存值检查
- 行 / 单元格级错误定位
- Excel Scientific Notation 基础归一化
- Dry Run / Import Review / Error CSV
- Templates / Variables / Rules / Layers / Tests / Versions
- Content Master / CRN Impact Analysis
- Quality / Versioned Preflight Profile / Audit Log
- Cloudflare Worker API scaffold
- D1 baseline migration
- Cloudflare Assets / D1 / R2 部署路线
- 18 个自动测试

## 本轮关键工程进展

### 1. Barcode / QR 不再是假图

`assets/codes.js` 已实现：

```text
Code 128-B
├── Start B
├── ASCII payload encoding
├── Mod-103 checksum
├── STOP
└── Quiet Zone

QR Version 4-L
├── Byte Mode UTF-8
├── 80 Data Codewords
├── 20 Reed-Solomon ECC Codewords
├── Finder / Timing / Alignment
├── Format Information
├── 8 Mask candidates
└── Penalty-based mask selection
```

默认 QR 示例已经通过独立 OpenCV QR 解码验证。

> 当前仍未确认客户/箱厂要求的一维码最终 Symbology，因此 v0.3 使用 Code 128-B 作为真实编码 PoC；不能擅自把它定义成 GS1-128。

### 2. 1:1 Vector PDF

`assets/pdf.js` 使用 PDF 原生 vector operators 输出：

- Text
- Code 128 bars
- QR modules
- Proof dieline / crease
- Production artwork

页面 `MediaBox` 由同一个真实 mm Geometry 转换为 pt：

```text
1 mm = 72 / 25.4 pt
```

因此网页 SVG Preview 与 PDF 不再是两套独立坐标模型。

当前字体使用 PDF Core Helvetica 作为技术 PoC，**Arial/批准字体嵌入或文字转曲仍是正式 Production Gate**。

### 3. Production Bundle 加入 SHA-256

当前正式导出包：

```text
US_SIDE_SEAL_<SKU>_<PACKAGE>_<REV>_ProductionBundle.zip
├── Production.pdf
├── Production.svg
├── DataSnapshot.json
├── PreflightReport.json
├── Manifest.json
└── README.txt
```

`Manifest.json` 记录 PDF/SVG/Snapshot/Preflight 的 SHA-256，用于审计和后续不可变 Revision。

### 4. Excel 已从“UI 假数据”升级为真实 Parser

`assets/xlsx-lite.js` 在浏览器直接解析 `.xlsx`：

```text
XLSX ZIP
  ↓
Central Directory
  ↓
Deflate / Stored Entries
  ↓
sharedStrings.xml
  ↓
worksheet XML
  ↓
Header Detection / Alias Mapping
  ↓
Normalized Records
  ↓
Cell-level Validation
```

当前支持 `.xlsx` / `.csv`；旧式 `.xls` BIFF 暂不解析，会明确提示另存为 `.xlsx`。

## 源 PDF Calibration

对 `美线侧封箱印刷模板20260520.pdf` 进行了矢量路径级分析：

- PDF 页面：`14400 × 10335.2 pt`
- 标注 `200mm` 的矢量参考段实测约 `199.46 mm`
- 误差约 `-0.27%`
- 源技术图中心结构宽约 `1143.94 mm`
- 大面高度约 `571.97 mm`
- 侧边带约 `190.66 mm`
- 样例 `47.24 × 23.62 × 7.87 INCH` ≈ `1200 × 600 × 200 mm`
- 源结构图约为真实样例箱规的 `95.35%`

所以生产 Geometry 使用订单真实箱规，不直接使用原 PDF 技术图线长。

详见 `docs/TEMPLATE_CALIBRATION_US_SIDE_SEAL.md`。

## 目录

```text
assets/
  app.css
  app.js
  domain.js
  codes.js               # Code128 + QR vector engines
  pdf.js                 # 1:1 vector PDF renderer
  xlsx-lite.js           # zero-dependency XLSX/CSV import engine

docs/
  DEVELOPMENT_PLAN_V3.md
  TEMPLATE_CALIBRATION_US_SIDE_SEAL.md
  CODE_PDF_XLSX_V0.3.md
  CLOUDFLARE_DEPLOYMENT.md
migrations/
  0001_init.sql
worker/
  index.js
tests/
  domain.test.cjs
  codes-pdf.test.cjs
  xlsx.test.cjs
index.html
wrangler.jsonc
package.json
```

## 质量检查

```bash
npm test
npm run check
```

当前自动测试覆盖：

- 1200×600×200 mm Geometry
- 多包规则
- Factory → CRN / Origin
- Weight / Package blocking
- PDF 200 mm calibration
- Code 128 checksum / unsupported payload
- QR Version 4-L codeword/ECC/matrix
- QR payload capacity
- PDF header / 1:1 MediaBox / Proof watermark
- CSV Header Detection
- XLSX ZIP + Shared Strings
- Repeated Header
- Fill Down
- TOTAL stop
- Cell-level error
- Scientific notation normalization

## Cloudflare 目标架构

- **Workers**：API / auth gateway / business services
- **Assets**：Web frontend
- **D1**：Template / Artwork / Revision / Preflight / Approval / Audit metadata
- **R2**：PDF / SVG / Proof / Production Bundle / source templates
- **Queues（后续）**：Excel batch / render jobs

详见 `docs/CLOUDFLARE_DEPLOYMENT.md`。

## 尚未达到正式生产条件的部分

- 一维码最终 Symbology / Barcode payload 业务确认
- QR payload / ECC 业务确认；当前引擎固定 Version 4-L
- Approved Font Registry + font embedding / outlining
- PDF/X profile
- Excel style/number-format 级 leading-zero 恢复
- Batch Passed Rows 真正逐行调用 PDF Renderer
- Auth / RBAC
- D1 persistence
- R2 artifact persistence
- immutable approval workflow
- Template visual regression
- external print preflight adapter
- 实物 Barcode Verifier 数据接入

## GitHub / Cloudflare

Repository：`guodongbuding66-spec/carton-artwork-studio`

代码结构从一开始保持 Cloudflare compatible，后续完成 D1/R2 与账户权限后部署 staging，再进入 production。
