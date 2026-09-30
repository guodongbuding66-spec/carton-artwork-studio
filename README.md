# Carton Artwork Studio

在线唛头 / 外箱印刷稿自动化系统。

当前仓库处于 **Phase 0 / Phase 1 工程原型**。产品目标不是通用设计软件，而是：

> Canonical Data → Rule Engine → Parametric mm Geometry → Vector Renderer → Preflight → Review → Production

## 当前版本：0.5.0

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
- **真实 QR 编码：自动 Version + ECC M，使用 MIT `qrcode-generator`，SVG/PDF 均输出矢量 modules**
- QR UTF-8 payload 支持
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
- **通过行可真实批量生成 Proof PDF / SVG / DataSnapshot，并打包为单一 ZIP**
- 自动检测 Mapping 结果并在 Batch 页面展示
- Templates / Variables / Rules / Layers / Tests / Versions
- Content Master / CRN Impact Analysis
- Quality / Versioned Preflight Profile / Audit Log
- Cloudflare Worker API scaffold
- D1 baseline migration + Batch / Mapping Profile migration
- Mapping Profile / Import Job D1 APIs
- R2 Artwork Export 上传 / 下载 API + SHA-256
- Cloudflare Assets / D1 / R2 部署路线
- CI 自动执行 Domain / Code / XLSX / Batch / PDF / ZIP 测试

## v0.5.0 关键工程进展

### 1. QR 从“技术预览”升级为标准编码器

项目现已 vendoring Kazuhiko Arase 的 MIT `qrcode-generator`：

- 自动选择 QR Version
- UTF-8 Byte Mode
- ECC M（当前模板默认）
- 网页 SVG 使用真实 QR modules
- PDF Renderer 使用同一 matrix 输出矢量矩形
- Batch 逐行验证 QR 是否可编码

第三方来源与许可证记录在 `THIRD_PARTY_NOTICES.md`。

> QR 的**业务 payload 和最终 ECC 级别**仍需客户/箱厂确认；编码器真实并不代表业务规则已经最终确认。

### 2. Batch 从“Import Review”进入真实生成

当前流程：

```text
XLSX / CSV
↓
Header Detection
↓
Alias Mapping
↓
Selective Fill Down
↓
Formula Cache Check
↓
Canonical Artwork Row
↓
Row Preflight
↓
PASS / ERROR
↓
Generate Passed Proofs
```

通过行会实际调用同一套：

- mm Geometry
- Code 128 renderer
- QR renderer
- Vector PDF renderer
- SVG renderer

并生成一个 `BatchProofs_YYYY-MM-DD.zip`。

失败行不会被静默跳过，`failed_rows.csv` 会记录 Row / Cell / Field / Error。

### 3. Production Export 与 README 对齐

单个已批准 Artwork 现在真正导出：

```text
<Artwork>_ProductionBundle.zip
├── Production.pdf
├── Production.svg
├── DataSnapshot.json
├── PreflightReport.json
├── Manifest.json
└── README.txt
```

Manifest 为 PDF / SVG / Snapshot / Preflight 记录 SHA-256。

Production 仍必须满足：

- Approved
- 0 blocking error
- Blocking review comment resolved

### 4. XLSX Import 加固

`assets/xlsx-lite.js` 追加：

- Header 必须包含 SKU / Item 类型字段
- Formula 有公式但无 cached value → cell-level ERROR
- Fill Down 改为**字段白名单**
  - Contract No.
  - Package Count
  - Factory
- 不再错误地向下复制 SKU / Barcode / QR

### 5. Cloudflare Persistence API

新增 `migrations/0002_batch_and_artifacts.sql`：

- `mapping_profiles`
- `import_jobs`
- `import_rows`

Worker 新增：

- `GET/POST /api/mapping-profiles`
- `GET/POST /api/import-jobs`
- `GET /api/import-jobs/:id`
- `POST /api/import-jobs/:id/rows`
- `POST /api/artworks/:id/exports`
- `GET /api/exports/:id`

Artifact 上传接口会：

1. 写入 R2
2. 计算 SHA-256
3. 写入 D1 `exports`
4. 写入 Audit Log

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
  codes.js               # Code128 + standards QR adapter
  pdf.js                 # 1:1 vector PDF renderer
  xlsx-lite.js           # zero-dependency XLSX/CSV import engine
  batch.js               # row → artwork / validation / review
  zip.js                 # store-only ZIP writer
  vendor/
    qrcode-generator.js  # MIT QR encoder

docs/
  DEVELOPMENT_PLAN_V3.md
  TEMPLATE_CALIBRATION_US_SIDE_SEAL.md
  CODE_PDF_XLSX_V0.3.md
  CLOUDFLARE_DEPLOYMENT.md
migrations/
  0001_init.sql
  0002_batch_and_artifacts.sql
worker/
  index.js
tests/
  domain.test.cjs
  codes.test.cjs
  xlsx.test.cjs
  batch.test.cjs
  pdf.test.cjs
  zip.test.cjs
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
- standards QR matrix / ECC M / UTF-8 payload
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
- QR payload / ECC 业务确认；当前模板默认 ECC M，Version 自动选择
- Approved Font Registry + font embedding / outlining
- PDF/X profile
- Excel style/number-format 级 leading-zero 恢复
- Batch 生成目前为 **Proof Bundle**；Production 仍需逐 Artwork 审批
- Auth / RBAC
- 前端尚未把所有工作流操作切换到 D1 API
- R2/D1 API 已实现但仍需在 Cloudflare 账户创建并绑定资源
- immutable approval workflow
- Template visual regression
- external print preflight adapter
- 实物 Barcode Verifier 数据接入

## GitHub / Cloudflare

Repository：`guodongbuding66-spec/carton-artwork-studio`

代码结构从一开始保持 Cloudflare compatible，后续完成 D1/R2 与账户权限后部署 staging，再进入 production。
