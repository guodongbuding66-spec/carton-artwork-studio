# Carton Artwork Studio

在线唛头 / 外箱印刷稿自动化系统。

当前仓库处于 **Phase 0 / Phase 1 工程原型**。产品目标不是通用设计软件，而是：

> Canonical Data → Rule Engine → Parametric mm Geometry → Vector Renderer → Preflight → Review → Production

## 当前版本：1.8.0

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
- Staging Readiness Center + R2 deep probe + release gate
- Production Asset Registry：Font / ICC + SHA-256 + Four-eyes approval
- D1 baseline migration + Batch / Mapping Profile + Users/Roles/Security + Template Lifecycle + Production Readiness + System Readiness migration
- Mapping Profile / Import Job D1 APIs
- R2 Artwork Export 上传 / 下载 API + SHA-256 + server-side approval gate
- Cloudflare Assets / D1 / R2 部署路线
- CI 自动执行 Domain / Code / XLSX / Batch / PDF / ZIP 测试

## v1.8.0 关键工程进展

### 1. PDF/X-4 Candidate Renderer

服务器 Renderer 新增 PDF/X-4 **Candidate** 路径：

- PDF 1.6
- Embedded TrueType
- XMP Metadata
- `pdfxid:GTS_PDFXVersion="PDF/X-4"`
- `/OutputIntents`
- `/S /GTS_PDFX`
- CMYK ICC `/DestOutputProfile`
- TrimBox / BleedBox
- PDF/X document info

这里明确叫 **Candidate**，不是“已经通过 PDF/X”。

### 2. CMYK ICC 与 PDFX_POLICY 精确绑定

PDFX_POLICY 现在要求：

- `profile`
- `iccAssetCode`
- `iccAssetVersion`
- `outputConditionIdentifier`

并且提交 / 批准政策时就检查：

- ICC Asset 必须存在；
- 必须已批准；
- 必须是精确 Code + Version；
- 当前 Candidate Renderer 只接受 CMYK ICC。

### 3. Quality > Assets 增加 PDF/X-4 Candidate Test

Reviewer / Template Approver 可以选择：

- Approved TrueType Font；
- Approved CMYK ICC；
- Output Condition Identifier；
- 当前 D1 Artwork；

生成带 Proof 属性的 PDF/X-4 Candidate。

系统执行内部 Structural Check，并写入 Audit，但不会把它登记为正式 Production PDF。

### 4. Candidate ≠ Conformance

当前 capability 明确拆成：

```text
pdfxCandidateProfiles = ["PDF/X-4"]
pdfxProfiles = []
```

所以 **Production Export 仍然 BLOCKED**。

只有接入独立 PDF/X Validator / 印厂 Preflight，并用固定 regression 文件实际通过后，才允许把 PDF/X-4 加入正式生产 capability。

详见 `docs/PDFX4_CANDIDATE.md`。

## v1.7.0 关键工程进展

### 1. TrueType Font Embedding 进入服务器 Renderer

正式字体不再由浏览器依赖 Helvetica / system font。

Worker 新增受控服务器渲染链：

```text
Approved Artwork Snapshot
        +
Approved FONT asset pinned by FONT_POLICY
        ↓
R2 read + SHA-256 verify
        ↓
TrueType cmap / metrics parse
        ↓
Type0 + CIDFontType2 + FontFile2
        ↓
ToUnicode CMap
        ↓
Authoritative Production PDF
```

缺少字符 glyph 时直接阻断，不允许静默替换字体。

### 2. Font Policy 必须绑定精确资产版本

FONT_POLICY 现在要求：

- `font`
- `assetCode`
- `assetVersion`
- `embedded=true` 或未来 `outlined=true`

当前嵌入 Renderer 仅支持 **TrueType outlines**。OpenType/CFF 可以进入资产库，但不能通过当前 Font Production Gate。

### 3. Embed Test PDF

Quality > Assets 对 Approved FONT 增加 **Embed Test PDF**。

测试稿：

- 从私有 R2 读取字体；
- 校验 SHA-256；
- 使用当前 D1 Artwork；
- 真正执行服务器端字体嵌入；
- 输出 Proof / NOT FOR PRODUCTION；
- 写入 Audit。

不会暴露 Font 原始文件。

### 4. Production PDF 改为服务器权威源

当全部 Production Readiness Gate 最终通过后，生产流程将先调用 Worker 生成并持久化：

`PRODUCTION_PDF`

Production Bundle 只能引用同 Artwork / Revision 的服务器 PDF Export ID + SHA-256。没有权威 PDF 证据，Worker 拒绝持久化 Production Bundle。

因此未来不能通过修改浏览器代码，把一个本地生成或替换过的 PDF 冒充正式生产稿。

### 5. 当前仍保持的硬门禁

已关闭：

- TrueType font embedding

仍未关闭：

- Font outlining
- PDF/X
- OutputIntent / ICC 真正写入 PDF
- 外部 PDF/X Validator

因此现在 Production Export 仍保持 BLOCKED，这是预期行为。

## v1.6.0 关键工程进展

### 1. Production Asset Registry

Quality 新增 **Assets** 页面，正式 Font / ICC Profile 不再依赖本地文件名或人工口头约定。

支持：

- `FONT`
- `ICC_PROFILE`
- R2 私有存储
- SHA-256
- Code / Version
- License / Source metadata
- DRAFT → SUBMITTED → APPROVED / REJECTED
- Four-eyes approval
- 新 Approved Version 自动 Retire 同 Code 的旧版本

### 2. 上传前结构验证

Font：

- TrueType / OpenType / SFNT signature
- Table Directory
- Table Tag
- Offset / Length bounds

ICC：

- profile size
- `acsp`
- ICC version
- Profile Class
- Color Space / PCS
- Tag Table bounds

结构错误文件不会进入正式 Asset Registry。

### 3. Approval 前重新验证 R2 内容

审批不只相信 Upload 时的结果。

APPROVE 前 Worker 会重新：

```text
R2 GET
↓
SHA-256 recompute
↓
compare stored SHA-256
↓
structural validation again
↓
APPROVE
```

如 R2 文件内容被替换，审批会被阻断并记录 Security Event。

### 4. Asset Provenance Gate

Font / ICC 在提交审批前必须填写 License / Source Note。

系统记录来源，但不会因为填写了文字就自动推定许可证有效。

### 5. Production Readiness 增加资产门禁

Production 现在额外要求：

- 至少一个 Approved FONT
- 至少一个 Approved ICC_PROFILE

但这**不会**把尚未实现的 Font Embedding / Outlining / PDF-X 伪装成 READY。

当前 Production 仍然正确保持 BLOCKED，直到 Renderer 真正消费这些已批准资产。

## v1.5.0 关键工程进展

### 1. Staging Readiness Center

系统管理页新增真实上线检查中心，由 Worker 读取当前 Cloudflare / D1 / R2 / Access / RBAC / Master Data 状态，不使用前端模拟结果。

Staging gate 包括：

- Cloudflare Access identity；
- `AUTH_BYPASS=0`；
- D1 binding；
- 最新 D1 migration = `0006_system_readiness.sql`；
- R2 binding；
- 24 小时内 R2 write/read/delete deep probe；
- Assets binding；
- Bootstrap Admin 已移除；
- Approved Template；
- Active Factory；
- OPERATOR / REVIEWER；
- 可执行 four-eyes 的至少两个独立身份；
- 4 个 Production Policy 记录完整。

### 2. Staging / Production 双层状态

系统明确区分：

```text
STAGING_READY
PRODUCTION_BLOCKED / PRODUCTION_READY
```

Staging 可以进入真实集成与双身份验收，但 Production 仍必须额外通过 Barcode / QR / Font / PDF-X renderer capability + policy gate。

### 3. R2 Deep Probe + Audit

Admin 可执行 R2 深度探测：

```text
PUT random object
↓
GET + payload verify
↓
DELETE
↓
D1 readiness run
↓
Audit Log
```

探测结果与完整 Readiness Report 写入 D1，避免“R2 binding 显示存在，但实际读写不可用”的假阳性。

### 4. 正式 Factory Master 创建

Content > Factories 新增 Admin 创建入口。

原 scaffold 的 3 个 Factory 继续保持 `SAMPLE`，不会被 Staging Gate 当作生产主数据。必须创建至少一个真实 `ACTIVE` Factory 才能通过对应门禁。

### 5. Post-deploy Staging Smoke

手动 staging workflow 部署完成后会继续运行 Access Service Token smoke test，检查：

- Worker service identity；
- D1 / R2 / Assets bindings；
- AUTH_BYPASS；
- 未认证请求不能通过 `/api/me`。

详见 `docs/STAGING_READINESS.md`。

## v1.4.0 关键工程进展

### 1. D1 Migration Smoke Test 进入 CI

每次 PR / main push 不再只检查 JavaScript 单元测试。

CI 现在会创建隔离的本地 D1，按顺序真实执行全部 migration，并验证关键表与 seed 状态：

- Template / Template Version / Approval
- Artwork / Revision / Comments / Approval
- Preflight / Export / Audit
- Batch / Mapping
- Users / RBAC / Security
- Reference Master
- Production Policy / Approval

### 2. 关键迁移结果自动验收

Migration smoke test 还会验证：

- 4 个 Production Policy 必须存在且初始为 DRAFT；
- scaffold 的 3 个示例 Factory 必须已经被隔离为 SAMPLE；
- `tplv-us-side-seal-20260520` 必须存在；
- 该 Template JSON 必须已经迁移到 schemaVersion 1 且 geometry.units = mm。

这可以提前发现“代码测试全绿，但 Cloudflare D1 migration 实际跑不起来”的问题。

### 3. CI Runtime 更新

GitHub Actions 从 checkout/setup-node v4 更新到 v6，避免旧 Node runtime 的弃用警告。

## v1.3.0 关键工程进展

### 1. Revision Compare 增加真实视觉对比

Quality > Compare 在 Canonical Path 差异之外，现在可以直接渲染两个冻结 Revision：

- Side by side
- Overlay
- Overlay opacity

两个画面都来自各自 Revision 保存的 Canonical Snapshot，不使用当前 Factory Master 覆盖历史 CRN / Origin。

### 2. 历史 Factory Snapshot 与当前 Master Data 解耦

视觉比较时，Factory / CRN / Country 从 Revision Snapshot 自身恢复。

因此 Factory Master 后续修改不会让历史 Revision 在 Compare 页面“被改写”。

### 3. SVG / PDF renderer context 对齐

修复了一个重要一致性问题：Artwork SVG 预览之前会走本地 seed Factory，而不是当前 D1 Factory Master。

现在：

- 当前 Artwork SVG → 当前 D1 Factory Master
- 历史 Revision SVG → 冻结 Snapshot Factory
- Production PDF → 当前已批准 Factory 数据
- Production SVG → 与 PDF 相同 Factory + QR ECC context
- Batch Proof PDF / SVG → 显式使用同一 QR ECC M

避免同一个 Bundle 里的 PDF 与 SVG 出现 CRN、Origin 或 QR ECC 不一致。

## v1.2.0 关键工程进展

### 1. Artwork Revision Compare 进入真实 D1 工作流

Quality > Compare 不再显示 roadmap 占位。

系统从 `artwork_revisions.data_snapshot_json` 读取两个冻结 Revision，按 Canonical Path 计算：

- CHANGED
- ADDED
- REMOVED
- From / To value

比较结果来自真实 Revision Snapshot，不生成虚构差异。

### 2. Production Evidence 写入服务器 Manifest

R2 Production Export 现在由 Worker 在持久化时追加服务器证据：

- Artifact SHA-256
- persistedBy / persistedAt
- Production Readiness 结果
- Barcode / QR / Font / PDF/X policy status
- policy submitter / approver / approval timestamp
- approved policy config snapshot

浏览器提供的 Manifest 不能覆盖这些服务器端证据。

### 3. Production 下载顺序加固

Production Bundle 不再先下载到本地、再尝试同步 R2。

新顺序：

```text
Browser validates current approval/readiness
        ↓
Build deterministic bundle
        ↓
Worker revalidates approval/readiness
        ↓
Persist R2 + D1 export record + server evidence
        ↓
Only then allow browser download
```

R2 不可用时正式 Production Download 保持阻断。

### 4. Production Policy 与真实 renderer capability 绑定

政策审批不能再“声明一个实际上不存在的能力”。

当前 renderer capability 明确为：

- Barcode: Code128-B
- QR ECC: L / M / Q / H
- Font embedding: **not implemented**
- Font outlining: **not implemented**
- PDF/X profiles: **none implemented**

所以即使有人把 Font Policy 写成 `embedded: true`，或把 PDF/X Policy 写成 `PDF/X-4`，服务器仍会判定 **not implemented** 并禁止提交/生产。

这意味着当前系统继续允许 Proof 工作流，但 Production Export 会正确保持锁定，直到真正实现字体嵌入/转曲和 PDF/X 输出，而不是用配置掩盖技术缺口。

## v1.1.0 关键工程进展

### 1. Excel / XLSX leading-zero fidelity

Import Engine 现在解析 `xl/styles.xml` 与自定义 Number Format。

对于 Excel 中以数值存储、但通过 `000000...` 格式显示前导零的 SKU / Barcode / 编码字段，会在导入时恢复显示值，而不是把前导零永久丢失。

同时增加了字符串级科学计数法整数还原，避免先转 JavaScript Number 再遇到大整数精度损失。

### 2. Production renderer visual regression

新增固定样例的 Production PDF Snapshot Gate：

- 真实 mm Geometry
- Code 128 vector
- QR vector
- Production PDF byte length
- SHA-256

当前基线：

```text
US_SIDE_SEAL / KF210215US-02PM-001
PDF bytes: 18653
SHA-256: b2c122cb39d331ef5a83256cc2e34a37cb6134044234385408df379df9310591
```

后续任何渲染器、布局、条码或 QR 变化都会触发 CI regression failure，要求明确审查后才能更新基线。

## v1.0.0 关键工程进展

### 1. Production Readiness 变成硬门禁

正式 Production Export 现在需要四个生产政策全部 **APPROVED + 配置有效**：

- Barcode Business Policy
- QR Business Policy
- Approved Font Policy
- PDF/X Production Policy

初始状态均为 **DRAFT / 未确认**，不会因为当前技术编码器可以生成条码或 QR，就假装业务规则已经确认。

### 2. 关键生产政策支持四眼审批

流程：

```text
Admin edits policy
      ↓
DRAFT
      ↓ validate
SUBMITTED
      ↓ different Template Approver / Admin identity
APPROVED / REJECTED
```

提交人不能批准自己提交的同一政策。

### 3. Production Bundle 防止浏览器绕过

生产稿导出现在有两层门禁：

1. 浏览器在生成/下载 Production Bundle **之前**重新读取服务器 Production Readiness；
2. Worker 在写 R2 **之前**再次检查 Production Readiness。

因此不能通过修改 LocalStorage 或只绕过 UI 按钮拿到有效生产稿。

### 4. Content Master 从占位进入 D1

新增通用 Reference Master：

- CUSTOMER
- PRODUCT
- COUNTRY
- SHARED

支持 D1 持久化、有效日期、状态、JSON 扩展字段和 Audit。

### 5. 演示 Factory 不再冒充正式 Master Data

早期工程 scaffold 中的 3 个示例 Factory 被迁移为 `SAMPLE` 状态。

正式 `GET /api/factories` 默认只返回 `ACTIVE` Factory，避免 fresh deployment 把测试工厂当成真实业务资料。

## v0.9.0 关键工程进展

### Template lifecycle 进入真实工作流

Template Center 不再只展示静态版本历史。D1 现在支持：

```text
Approved Version
      ↓ Clone
Draft
      ↓ Save / Schema Gate
Submitted
      ↓ Template Approver
Approved / Rejected
```

Template Version 保存 JSON、Effective Date、Preflight Profile、Notes、创建人、提交人和批准人。

### Template four-eyes

Template Designer 不能批准自己提交的同一个 Template Version。该规则在 Worker 后端执行，Admin 也不能绕过。

### Schema validation gate

提交和批准前都会验证：

- schemaVersion；
- mm geometry；
- K-only print profile；
- approved CodeBlock profile；
- CodeBlock locked；
- CRN placements。

无效 Draft 可以编辑，但不能进入 Approved。

### Approved Version 不可原地修改

仅 DRAFT / REJECTED 可以编辑。批准新版本时：

- 新版本 → APPROVED；
- 旧 Approved → DEPRECATED；
- Approval decision 写入 `template_approvals`；
- Audit Log 写入 Template Version 操作。

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
  STAGING_READINESS.md
  PRODUCTION_ASSETS.md
  PDFX4_CANDIDATE.md
migrations/
  0001_init.sql
  0002_batch_and_artifacts.sql
  0003_auth_rbac.sql
  0004_template_lifecycle.sql
  0005_reference_and_readiness.sql
  0006_system_readiness.sql
  0007_production_assets.sql
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
- Production renderer SHA-256 snapshot regression
- Production policy renderer capability gate
- Canonical Revision diff
- Staging readiness gate logic
- D1 full migration chain smoke test

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
- Approved Font / ICC Asset Registry 已实现；Approved TrueType Font 已接入服务器 PDF Renderer，仍需 outlining 与 ICC OutputIntent
- PDF/X-4 Candidate 已实现 ICC OutputIntent / XMP / page-box 结构；仍需独立外部 PDF/X conformance validator 与印厂/RIP 验收
- Excel style/number-format leading-zero 恢复已实现；仍需更多真实 Packing List 样本做兼容性回归
- Batch 生成目前为 **Proof Bundle**；Production 仍需逐 Artwork 审批
- Cloudflare Access / RBAC / Staging Readiness 代码已实现；仍需在 Cloudflare 控制台创建正式 Access Application、D1/R2 与 Access Service Token
- D1/R2 API、Persistence Bridge、R2 deep probe 已实现；D1 migrations 已纳入 CI smoke test，仍需绑定真实 staging / production resources 并完成首次 Readiness 验收
- immutable approval workflow 与 four-eyes 已进入后端；仍需 staging 双身份验收
- Production renderer snapshot regression、Canonical Revision Compare、Side-by-side / Overlay 已实现；像素级 Difference / Flicker 仍待扩展
- external print preflight adapter
- 实物 Barcode Verifier 数据接入

## GitHub / Cloudflare

Repository：`guodongbuding66-spec/carton-artwork-studio`

代码结构从一开始保持 Cloudflare compatible，后续完成 D1/R2 与账户权限后部署 staging，再进入 production。
