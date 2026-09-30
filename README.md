# Carton Artwork Studio

在线唛头 / 外箱印刷稿自动化系统。

当前仓库处于 **Phase 0 / Phase 1 工程原型**。产品目标不是通用设计软件，而是：

> Canonical Data → Rule Engine → Parametric mm Geometry → Vector Renderer → Preflight → Review → Production

## 当前版本：0.8.0

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
- Cloudflare Worker API + Access/RBAC gateway + live master-data/audit APIs
- D1 baseline migration + Batch / Mapping Profile + Users/Roles/Security migration
- Mapping Profile / Import Job D1 APIs
- R2 Artwork Export 上传 / 下载 API + SHA-256 + server-side approval gate
- Cloudflare Assets / D1 / R2 部署路线
- CI 自动执行 Domain / Code / XLSX / Batch / PDF / ZIP 测试

## v0.8.0 关键工程进展

### 1. 工作台改为 D1 实时数据

Dashboard 不再使用固定数量或示例 Artwork。状态统计、Recent Artwork、打开现有稿件均来自 `/api/artworks`。

全局搜索支持 SKU / Contract / Artwork No.，搜索结果可以直接打开对应 D1 Artwork。

### 2. 远程 Artwork 可完整回填编辑器

新增 Canonical Snapshot → Artwork hydration：

```text
D1 canonical_data_json
        ↓
artworkFromCanonical()
        ↓
Artwork Workspace
```

打开远程 Artwork 时恢复 SKU、合同、包数、重量、尺寸、Factory、Barcode、QR、Revision 和状态，而不是只恢复状态字段。

### 3. Factory Master 与 Impact Analysis 真实化

Content > Factories 改为读取 D1 Factory Master。

Admin 可执行真实 Impact Analysis：

- 当前 Artwork 总数；
- Draft / In Review / Approved / Rejected；
- Approved but unproduced；
- 历史 Revision 数量。

更新 Factory / CRN / Country / Effective 后只更新 Master Data，不重写历史 Revision Snapshot。

### 4. Audit / Quality 去除伪数据

Admin Audit Log 改为真实 `/api/audit`。

Quality > Reports 使用当前 Preflight 和持久化 Preflight Audit；无数据时明确显示“暂无记录”，不再展示虚构 Artwork / Hash / 时间。

### 5. Live reference data

应用启动后，在 Access + D1 可用时并行加载：

- Factories；
- Templates；
- Artworks；
- Audit（有权限时）；
- 当前 Artwork + Comments。

断开云端时 Dashboard / Content Master 不再把本地 seed 当成实时业务数据。

## v0.7.0 关键工程进展

### 1. Cloudflare Access + D1 RBAC

身份与权限拆成两层：

```text
Cloudflare Access identity
          ↓
Cf-Access-Authenticated-User-Email
          ↓
D1 users / user_roles
          ↓
Application permission
```

应用角色：

- `OPERATOR`
- `REVIEWER`
- `TEMPLATE_DESIGNER`
- `TEMPLATE_APPROVER`
- `ADMIN`

前端按钮隐藏/禁用只是 UX；Worker API 会再次执行相同权限检查。

### 2. Four-eyes Approval

Revision 记录真实提交人邮箱。

同一个 Access 身份不能审批自己提交的 Revision：

```text
Operator A submits R04
Reviewer B approves R04    ✅
Operator A approves R04    ❌ FOUR_EYES_REQUIRED
```

即使拥有 ADMIN 角色也不能绕过。

### 3. Review Comment 真持久化

评论按 `Artwork + Revision` 保存到 D1：

- 普通评论；
- Blocking comment；
- Reviewer resolve；
- Approval gate；
- Production export gate。

Approval 后如果当前 Revision 又出现未解决 Blocking comment，R2 Production Export 仍会再次被后端阻断。

### 4. Production Export 双重验证

浏览器生成 Production Bundle 前会重新读取服务器 Artwork 状态。

Worker 上传 R2 时再次验证：

- Artwork = APPROVED；
- Revision = current Revision；
- Revision = APPROVED；
- 无 unresolved blocking comments；
- 当前身份拥有 Production Export 权限。

因此仅修改浏览器 LocalStorage 无法获得有效生产导出。

### 5. RBAC Admin

系统管理页开始接入真实 D1 用户与角色：

- Create User；
- Assign / replace roles；
- Access identity 展示；
- Security event log schema。

首次部署可以用 `BOOTSTRAP_ADMIN_EMAIL` 完成安全引导，之后移除该变量。

### 6. Staging 部署骨架

新增：

- `.dev.vars.example`
- `docs/ACCESS_RBAC.md`
- `docs/CLOUDFLARE_DEPLOYMENT.md`
- `scripts/render-wrangler.mjs`
- `.github/workflows/deploy-staging.yml`

Staging workflow 仅支持手动触发，并在部署前先运行完整 CI 与 D1 migrations。

## v0.6.0 关键工程进展

### 1. 前端开始接入 Cloudflare Persistence

新增 `assets/api.js`，把浏览器端与 Cloudflare Worker API 隔离成独立 Adapter。

当前 Artwork 工作流：

```text
Local Draft
   ↓ Save
D1 Artwork
   ↓ Preflight
D1 Preflight Run
   ↓ Submit
Immutable Revision / IN_REVIEW
   ↓ Reviewer Decision
APPROVED / REJECTED
   ↓
Production Bundle
   ↓
R2 + SHA-256 + Audit Log
```

如果 D1 未绑定或 API 不可达，界面明确显示 **Local Mode**，不会假装云端保存成功。

### 2. Revision 开始真正不可变

- `IN_REVIEW` 与 `APPROVED` 数据不能原地覆盖。
- 被拒绝的 Revision 保留原快照；重新提交会创建下一 Revision。
- Approved 后通过“创建新 Revision”继续修改。
- Approval 仅允许对当前 `IN_REVIEW` Revision 操作。
- Approval 前要求当前 Revision 存在非 Error Preflight。
- 后端已预留 Blocking Comment Gate。

### 3. Production Artifact 进入 R2

在 Cloudflare R2 binding 可用时，Production Bundle 除浏览器下载外还会上传 R2，并写入：

- D1 `exports`
- SHA-256
- Renderer version
- Manifest
- Audit log

浏览器端仍保留本地下载，因此 R2 写入失败不会丢失刚生成的文件。

### 4. Batch Import 进入 D1

真实 Excel/CSV Import Review 可同步：

- `import_jobs`
- `import_rows`
- Mapping Profile
- Passed / Failed summary
- Canonical row snapshot
- row issues

500 行以上按块提交，避免单次请求过大。

### 5. UI 工作流不再允许直接改 Approved 状态

Artwork 状态不再使用可随意切换的下拉框：

- Draft：可编辑
- In Review：字段锁定
- Approved：字段锁定，可 Production Export
- Rejected：允许修改，但重新提交生成新 Revision

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
  api.js                 # Cloudflare Worker/D1/R2/Access client adapter
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
  0003_auth_rbac.sql
worker/
  auth.js                 # Access identity + RBAC policy
  index.js
tests/
  auth.test.mjs
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
- Cloudflare Access / RBAC 代码已实现；仍需在 Cloudflare 控制台创建正式 Access Application 与 D1/R2 资源
- D1/R2 API 与前端 Persistence Bridge 已实现，但仍需绑定正式 staging / production resources
- immutable approval workflow 已进入后端；仍需 staging 双身份验收
- Template visual regression
- external print preflight adapter
- 实物 Barcode Verifier 数据接入

## GitHub / Cloudflare

Repository：`guodongbuding66-spec/carton-artwork-studio`

代码结构从一开始保持 Cloudflare compatible，后续完成 D1/R2 与账户权限后部署 staging，再进入 production。
