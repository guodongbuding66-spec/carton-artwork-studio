import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync("assets/app.js","utf8");
const domainSource=fs.readFileSync("assets/domain.js","utf8");

assert.match(app,/function localArtworkEditable\(\)\{return !\["in_review","approved"\]\.includes\(state\.artwork\.status\);\}/);
assert.match(app,/function isArtworkLocked\(\)\{return !localArtworkEditable\(\);\}/);
assert.match(app,/async function saveDraft\(\)[\s\S]*?persistLocalDraft\(\);[\s\S]*?if\(!cloudArtworkWritable\(\)\)/);
assert.match(app,/async function runPreflightAction\(\)[\s\S]*?persistLocalDraft\(\);[\s\S]*?if\(cloudArtworkWritable\(\)\)/);
assert.match(app,/async function importBatch\(file\)\{\s*try\{/);
assert.doesNotMatch(app,/async function importBatch\(file\)\{\s*if\(!permitted\("batchWrite"\)\)/);
assert.match(app,/data-action="dry-run" \$\{state\.batchRecords\.length\?"":"disabled"\}/);
assert.match(app,/data-action="batch-generate" \$\{stats\.passed&&!state\.batchGenerating\?"":"disabled"\}/);
assert.match(app,/dropzone\.ondrop=async\(e\)=>/);
assert.match(app,/async function addUploadedArtworkElement\(file,type="image"\)/);
assert.match(app,/function addGeneratedQrElement\(\)/);
assert.match(app,/querySelectorAll\("\[data-art-element\]"\)/);
assert.match(app,/data-action="upload-image-trigger"/);
assert.match(app,/data-action="upload-qr-trigger"/);
assert.match(app,/data-action="add-generated-qr"/);
assert.match(app,/function addTextElement\(\)/);
assert.match(app,/function reorderSelectedElement\(mode\)/);
assert.match(app,/function alignSelectedElement\(mode\)/);
assert.match(app,/data-action="layer-front"/);
assert.match(app,/"align-hcenter","水平中"/);
assert.match(app,/if\(action==="align-hcenter"\) return alignSelectedElement\("hcenter"\);/);
assert.match(app,/data-element-prop="panelId"/);
assert.match(app,/data-element-constrain/);
assert.match(app,/function addBarcodeElement\(\)/);
assert.match(app,/function addHandlingSymbol\(\)/);
assert.match(app,/data-action="add-barcode-element"/);
assert.match(app,/data-action="add-handling-symbol"/);
assert.match(app,/data-element-prop="symbology"/);
assert.match(app,/GS1-128 \/ SSCC/);
assert.match(app,/function normalizeSelectedSscc\(\)/);
assert.match(app,/if\(action==="normalize-sscc"\) return normalizeSelectedSscc\(\);/);
assert.match(app,/C\.gs1_128Bars\(payload/);
assert.match(app,/data-element-prop="symbolKey"/);
assert.match(app,/function barcodeSvgBody\(element,w,h,artwork=state\.artwork,factoryList=state\.factories\)/);
assert.match(app,/function handlingSymbolSvgBody\(key,w,h\)/);
assert.match(app,/function addBoundTextElement\(\)/);
assert.match(app,/historyPast:\s*\[\]/);
assert.match(app,/historyFuture:\s*\[\]/);
assert.match(app,/function pushArtworkHistory\(\)/);
assert.match(app,/function undoArtwork\(\)/);
assert.match(app,/function redoArtwork\(\)/);
assert.match(app,/data-action="undo-artwork"/);
assert.match(app,/data-action="redo-artwork"/);
assert.match(app,/function bindEditorKeyboard\(\)/);
assert.match(app,/const step=event\.altKey\?0\.1:\(event\.shiftKey\?5:1\);/);
assert.match(app,/if\(mod&&key==="d"\)/);
assert.match(app,/event\.key==="Delete"\|\|event\.key==="Backspace"/);
assert.match(app,/data-element-resize=/);
assert.match(app,/querySelectorAll\("\[data-element-resize\]"\)/);
assert.match(app,/element\.w=nextW;element\.h=nextH/);
assert.match(app,/data-action="add-bound-text-element"/);
assert.match(app,/data-element-prop="bindingKey"/);
assert.match(app,/D\.resolvedElementText\(selected,state\.artwork,state\.factories\)/);
assert.match(app,/D\.resolvedElementPayload\(selected,state\.artwork,state\.factories\)/);
assert.match(app,/const text=D\.resolvedElementText\(e,artwork,state\.factories\);/);
assert.match(app,/const layout=D\.textLayout\(e,text\);/);
assert.match(app,/renderLines:layout\.lines/);
assert.match(app,/renderLineWidthsMm:layout\.widthsMm/);
assert.match(app,/\$\{code\}\$\{custom\}\$\{guideLayer\}\$\{watermark\}/);
assert.match(app,/selectedElementIds:\s*\[\]/);
assert.match(app,/function selectedArtworkElements\(\)/);
assert.match(app,/function toggleElementSelection\(id\)/);
assert.match(app,/function alignSelectedElements\(mode\)/);
assert.match(app,/function distributeSelectedElements\(axis\)/);
assert.match(app,/data-action="distribute-horizontal"/);
assert.match(app,/data-action="distribute-vertical"/);
assert.match(app,/if\(event\.shiftKey\) toggleElementSelection/);
assert.match(app,/DO_NOT_STACK/);
assert.match(app,/KEEP_AWAY_FROM_HEAT/);
assert.match(app,/NO_HOOKS/);
assert.match(app,/function decodeUploadedQrElement\(element\)/);
assert.match(app,/globalThis\.BarcodeDetector/);
assert.match(app,/function verifySelectedQrImage\(\)/);
assert.match(app,/data-action="verify-uploaded-qr"/);
assert.match(app,/data-element-prop="expectedPayload"/);
assert.match(app,/data-action="upload-symbol-trigger"/);
assert.match(app,/addUploadedArtworkElement\(file,"symbol-image"\)/);
assert.match(app,/type==="symbol-image"/);
assert.match(app,/function barcodePhysicalDefaults\(symbology\)/);
assert.match(app,/data-element-prop="moduleMm"/);
assert.match(app,/data-element-prop="barHeightMm"/);
assert.match(app,/data-element-prop="quietModules"/);
assert.match(app,/data-element-prop="wideRatio"/);
assert.match(app,/data-element-bearer/);
assert.match(app,/ITF-14 Review Profile/);
assert.match(app,/GS1-128 Logistics Review Profile/);
assert.match(app,/state\.artwork\[k\]=el\.type==="number"\?Number\(el\.value\):el\.value;\s*refreshControlledShippingBlocks\(\);\s*refreshAutoFitTextElements\(\);\s*persistLocalDraft\(\);/);

assert.ok(app.includes("function barcodeModelForElement(element"));
assert.ok(app.includes("function barcodePhysicalSize(element"));
assert.ok(app.includes("function syncBarcodeElementSize(element"));
assert.ok(app.includes('selected.type==="barcode"?"readonly":""'));
assert.ok(app.includes('e.type!=="barcode"'));
assert.ok(app.includes("no fit-to-box scaling"));

console.log("Local workspace usability regression tests passed.");


{
  const fs = await import("node:fs");
  const deployWorkflow=fs.readFileSync(".github/workflows/deploy-staging.yml","utf8");
  assert.match(deployWorkflow,/push:\s*\n\s*branches:\s*\n\s*- staging/);
  assert.match(deployWorkflow,/workflow_dispatch:/);
  assert.match(deployWorkflow,/Post-deploy staging smoke test/);
  assert.match(deployWorkflow,/Upload staging acceptance evidence/);
}


{
  const fs = await import("node:fs");
  const deployWorkflow=fs.readFileSync(".github/workflows/deploy-staging.yml","utf8");
  assert.match(deployWorkflow,/Check staging fallback configuration/);
  assert.match(deployWorkflow,/CLOUDFLARE_API_TOKEN/);
  assert.match(deployWorkflow,/steps\.fallback-config\.outputs\.configured == 'true'/);
  assert.match(deployWorkflow,/FALLBACK_NOT_CONFIGURED/);
  assert.match(deployWorkflow,/if: always\(\)/);
}


assert.match(app,/const OPPOSITE_PANEL_MAP=Object\.freeze/);
assert.match(app,/function panelRelativePosition\(element,panel\)/);
assert.match(app,/function cloneSelectionToPanel\(targetPanelId\)/);
assert.match(app,/function cloneSelectionToOppositePanel\(\)/);
assert.match(app,/data-action="copy-selection-panel"/);
assert.match(app,/data-action="copy-opposite-panel"/);
assert.match(app,/function smartSnapElementPosition\(e,x,y,excludeIds=\[\]\)/);
assert.match(app,/data-snap-guide-x/);
assert.match(app,/data-snap-guide-y/);
assert.match(app,/function selectionMoveLimits\(items\)/);
assert.match(app,/function moveSelectionBy\(items,dx,dy\)/);
assert.match(app,/const alreadySelected=isElementSelected\(id\)/);
assert.match(app,/const dragItems=selectedArtworkElements\(\)\.filter/);
assert.match(app,/updateSnapGuides\(svg,snapped\.guides\)/);


assert.match(app,/function selectionUnitIds\(id\)/);
assert.match(app,/function newGroupId\(\)/);
assert.match(app,/function groupSelectedElements\(\)/);
assert.match(app,/function ungroupSelectedElements\(\)/);
assert.match(app,/data-action="group-selection"/);
assert.match(app,/data-action="ungroup-selection"/);
assert.match(app,/function clonePanelLayout\(sourcePanelId,targetPanelId\)/);
assert.match(app,/data-action="copy-panel-layout"/);
assert.match(app,/data-art="safeMarginMm"/);
assert.match(app,/data-element-safe-exempt/);
assert.match(app,/function fitTextElementInPlace\(element\)/);
assert.match(app,/data-element-autofit/);
assert.match(app,/data-action="fit-text-element"/);
assert.match(app,/function selectionSpacingSvg\(elements=selectedArtworkElements\(\)\)/);
assert.match(app,/data-spacing-overlay/);
assert.match(app,/data-marquee-surface/);
assert.match(app,/data-marquee-box/);
assert.match(app,/selectionUnitIds\(item\.id\)/);
assert.match(app,/updateSpacingOverlay\(svg\)/);


assert.match(app,/function clampElementToBounds\(e\)[\s\S]*D\.elementVisualBounds\(e\)/);
assert.match(app,/function smartSnapElementPosition\(e,x,y,excludeIds=\[\]\)[\s\S]*D\.elementVisualBounds/);
assert.match(app,/function selectionBounds\(elements=selectedArtworkElements\(\)\)[\s\S]*D\.elementVisualBounds/);
assert.match(app,/function selectionMoveLimits\(items\)[\s\S]*D\.elementVisualBounds/);
assert.match(app,/function alignSelectedElements\(mode\)[\s\S]*D\.elementVisualBounds\(e\)/);
assert.match(app,/function distributeSelectedElements\(axis\)[\s\S]*D\.elementVisualBounds/);
assert.match(app,/const v=D\.elementVisualBounds\(item\);\s*const hit=v\.left<right&&v\.right>left&&v\.top<bottom&&v\.bottom>top/);


assert.match(app,/function constrainResizeDimensions\(element,desiredW,desiredH,minSize=5\)/);
assert.match(app,/D\.constrainElementResize\(/);
assert.match(app,/const resolved=constrainResizeDimensions\(element,Math\.max\(5,p\.x\),Math\.max\(5,p\.y\)\)/);
assert.match(app,/resizeLimited=resolved\.limited/);
assert.match(app,/尺寸已限制在旋转后的面板边界内/);


assert.match(app,/function sanitizeSvgText\(svgText\)/);
assert.match(app,/vectorDataUrl/);
assert.match(app,/sourceMimeType/);
assert.match(app,/originalFileName/);
assert.match(app,/rasterizeArtworkSource\(vectorDataUrl,2400,true\)/);
assert.match(app,/data-element-wrap/);
assert.match(app,/data-element-prop="lineHeight"/);
assert.match(app,/D\.textLayout\(e,D\.resolvedElementText/);
assert.match(app,/function addShippingMarkBlock\(\)/);
assert.match(app,/D\.createShippingMarkBlockElements\(state\.artwork,panel,state\.factories/);
assert.match(app,/version:def\?\.version\|\|"1\.1\.0"/);
assert.match(app,/data-action="add-shipping-mark-block"/);
assert.match(app,/D\.effectiveImageDpi\(selected\)/);
assert.match(app,/D\.productionElementQualification\(selected\)/);
assert.match(app,/renderLines:layout\.lines/);
assert.match(app,/renderLineWidthsMm:layout\.widthsMm/);


assert.match(app,/productionQualification:\s*null/);
assert.match(app,/productionQualificationBusy:\s*false/);
assert.match(app,/async function loadProductionQualification\(renderAfter=true/);
assert.match(app,/api\.productionQualification\(state\.remoteArtworkId\)/);
assert.match(app,/Server Production Qualification/);
assert.match(app,/data-action="server-production-qualification"/);
assert.match(app,/function controlledBlockItemsFor\(/);
assert.match(app,/function setSelectedControlledBlockLock\(locked\)/);
assert.match(app,/data-action="lock-controlled-block"/);
assert.match(app,/data-action="unlock-controlled-block"/);
assert.match(app,/受控 Block 不能解除组合/);
assert.match(app,/受控 Block 不能用普通 Group 重组/);


assert.match(app,/function persistLocalDraft\(\)\{\s*state\.productionQualification=null;/);
assert.match(app,/if\(!e\|\|!localArtworkEditable\(\)\|\|e\.locked\) return;\s*const key=el\.dataset\.elementProp/);
assert.match(app,/if\(e\.blockType&&e\.groupId\)\{\s*setSelectedControlledBlockLock\(Boolean\(lock\.checked\)\)/);
assert.match(app,/list\[index\]\?\.locked/);
assert.match(app,/!localArtworkEditable\(\)\|\|e\.locked\) return;\s*pushArtworkHistory\(\);\s*const b=elementBounds\(e\)/);


assert.match(app,/function reflowShippingMarkGroup\(groupId,options=\{\}\)/);
assert.match(app,/D\.shippingMarkBlockLayout\(state\.artwork,panel,state\.factories/);
assert.match(app,/function refreshControlledShippingBlocks\(\)/);
assert.match(app,/refreshControlledShippingBlocks\(\);\s*refreshAutoFitTextElements\(\);/);
assert.match(domainSource,/blockType:root\.type/);
assert.match(domainSource,/blockVersion:version/);
assert.match(domainSource,/blockSlot:slot\.id/);
assert.match(app,/locked:true,visible:true/);
assert.match(app,/data-action="reflow-controlled-block"/);
assert.match(app,/if\(action==="reflow-controlled-block"\) return reflowSelectedControlledBlock\(\)/);
assert.match(app,/allowControlledOversized/);
assert.match(app,/String\(element\.blockVersion\|\|""\)!=="1\.1\.0"/);


assert.match(app,/controlledShippingMark:\{enabled:true,panelId:"TOP_FACE",version:"1\.1\.0"\}/);
assert.match(app,/customElements:proofPdfElements\(art\)/);
assert.match(app,/controlledPreset:\{type:"SHIPPING_MARK_STANDARD",version:"1\.1\.0",panelId:"TOP_FACE"\}/);
