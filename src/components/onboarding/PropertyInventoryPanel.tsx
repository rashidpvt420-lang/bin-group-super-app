import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid, IconButton, Paper,
  Stack, TextField, Typography, alpha,
} from '@mui/material';
import {
  Bot, CheckCircle2, FileSearch, FileText, Minus, Plus, Sparkles, Upload, X,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import type { PropertyData } from '../../store/onboardingStore';
import { auth, functions, getDownloadURL, ref, storage, uploadBytes } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  calculatePropertyIntelligence,
  getSuggestedSpaces,
  type SpaceInventoryItem,
} from '../../utils/propertyIntelligence';

interface Props {
  property: PropertyData;
  onChange: (patch: Partial<PropertyData>) => void;
  ar: boolean;
  isRTL: boolean;
}

const slug = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const PropertyInventoryPanel: React.FC<Props> = ({ property, onChange, ar, isRTL }) => {
  const label = (en: string, arText: string) => ar ? arText : en;
  const suggestions = useMemo(() => getSuggestedSpaces(property.propertyType), [property.propertyType]);
  const inventory: SpaceInventoryItem[] = useMemo(
    () => Array.isArray(property.spaceInventory) ? property.spaceInventory : [],
    [property.spaceInventory],
  );
  const intelligence = useMemo(
    () => calculatePropertyIntelligence({ ...property, spaceInventory: inventory }),
    [property, inventory],
  );
  const floorPlanAnalysis = property.floorPlan?.aiAnalysis || null;

  const [customSpace, setCustomSpace] = useState('');
  const [floorPlanUploading, setFloorPlanUploading] = useState(false);
  const [floorPlanAnalyzing, setFloorPlanAnalyzing] = useState(false);
  const [floorPlanError, setFloorPlanError] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(String(property.ownerPropertyDescription || ''));
  const [improvedDescription, setImprovedDescription] = useState('');

  React.useEffect(() => {
    setDescriptionDraft(String(property.ownerPropertyDescription || ''));
  }, [property.id, property.ownerPropertyDescription]);

  const updateInventory = (next: SpaceInventoryItem[], extraPatch: Partial<PropertyData> = {}) => {
    const nextProperty = { ...property, ...extraPatch, spaceInventory: next } as PropertyData;
    onChange({
      ...extraPatch,
      spaceInventory: next,
      propertyIntelligence: calculatePropertyIntelligence(nextProperty),
    });
  };

  const countFor = (id: string) => inventory.find((item) => item.type === id)?.count || 0;

  const setCount = (id: string, count: number) => {
    const definition = suggestions.find((item) => item.id === id);
    if (!definition) return;
    const safeCount = Math.max(0, Math.round(Number(count) || 0));
    const without = inventory.filter((item) => item.type !== id);
    if (!safeCount) {
      updateInventory(without);
      return;
    }
    updateInventory([
      ...without,
      {
        id,
        type: id,
        labelEn: definition.en,
        labelAr: definition.ar,
        count: safeCount,
        source: 'owner',
        verified: false,
      },
    ]);
  };

  const addCustomSpace = () => {
    const value = customSpace.trim();
    if (!value) return;
    const id = `custom_${slug(value) || Date.now()}`;
    const existing = inventory.find((item) => item.type === id);
    if (existing) {
      updateInventory(inventory.map((item) => item.type === id ? { ...item, count: item.count + 1 } : item));
    } else {
      updateInventory([...inventory, {
        id,
        type: id,
        labelEn: value,
        labelAr: value,
        count: 1,
        source: 'owner',
        verified: false,
      }]);
    }
    setCustomSpace('');
  };

  const analyseFloorPlan = async (storagePath: string, fileUrl: string, contentType: string, floorPlanMetadata: Record<string, any>) => {
    setFloorPlanAnalyzing(true);
    try {
      const result: any = await httpsCallable(functions, 'processFloorPlanAI')({
        storagePath,
        fileUrl,
        contentType,
        propertyType: property.propertyType,
      });
      const payload = result.data || {};
      if (payload.status !== 'SUCCESS' || !payload.data) {
        onChange({ floorPlan: { ...floorPlanMetadata, aiStatus: 'manual_review_required', verificationState: 'OWNER_CONFIRMATION_REQUIRED' } });
        setFloorPlanError(label(
          'AI could not reliably read this floor plan. Nothing was guessed or applied. Continue with the quick counters below.',
          'لم يتمكن الذكاء الاصطناعي من قراءة المخطط بشكل موثوق. لم يتم تخمين أو تطبيق أي بيانات. تابع باستخدام العدادات السريعة أدناه.',
        ));
        return;
      }
      onChange({
        floorPlan: {
          ...floorPlanMetadata,
          aiStatus: 'suggested',
          aiAnalysis: payload.data,
          aiProvider: payload.provider,
          verificationState: 'OWNER_CONFIRMATION_REQUIRED',
          autoVerified: false,
          analyzedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Floor plan AI analysis failed:', error);
      onChange({ floorPlan: { ...floorPlanMetadata, aiStatus: 'manual_review_required', verificationState: 'OWNER_CONFIRMATION_REQUIRED' } });
      setFloorPlanError(label(
        'Floor-plan AI is temporarily unavailable. Your file is saved; continue manually and BIN GROUP can verify it during the property visit.',
        'تحليل المخطط بالذكاء الاصطناعي غير متاح مؤقتاً. تم حفظ الملف؛ تابع يدوياً ويمكن لـ BIN GROUP التحقق منه أثناء زيارة العقار.',
      ));
    } finally {
      setFloorPlanAnalyzing(false);
    }
  };

  const uploadFloorPlan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFloorPlanUploading(true);
    setFloorPlanError('');
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('AUTH_REQUIRED_FOR_FLOOR_PLAN_UPLOAD');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `owners/${uid}/property_documents/floor_plans/${Date.now()}_${safeName}`;
      const fileRef = ref(storage, storagePath);
      const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      await uploadBytes(fileRef, file, { contentType });
      const url = await getDownloadURL(fileRef);
      const floorPlanMetadata = {
        status: 'uploaded',
        name: file.name,
        type: contentType,
        size: file.size,
        url,
        storagePath,
        source: 'owner',
        uploadedAt: new Date().toISOString(),
        aiStatus: 'analyzing',
      };
      onChange({ floorPlan: floorPlanMetadata });
      await analyseFloorPlan(storagePath, url, contentType, floorPlanMetadata);
    } catch (error) {
      console.error('Floor plan upload failed:', error);
      setFloorPlanError(label('Floor plan upload failed. You can continue by adding spaces manually.', 'فشل رفع مخطط الطابق. يمكنك المتابعة بإضافة المساحات يدوياً.'));
    } finally {
      setFloorPlanUploading(false);
      event.target.value = '';
    }
  };

  const applyFloorPlanSuggestions = () => {
    const totals = Array.isArray(floorPlanAnalysis?.totals) ? floorPlanAnalysis.totals : [];
    if (!totals.length) return;

    const nextByType = new Map<string, SpaceInventoryItem>();
    for (const item of inventory) nextByType.set(item.type, item);

    for (const raw of totals) {
      const count = Math.max(0, Math.round(Number(raw?.count) || 0));
      if (!count) continue;
      const rawType = String(raw?.type || '').trim();
      const definition = suggestions.find((item) => item.id === rawType);
      const displayLabel = String(raw?.label || definition?.en || rawType || 'Space').trim();
      const type = definition ? definition.id : `custom_ai_${slug(displayLabel) || Date.now()}`;
      const existing = nextByType.get(type);
      if (existing?.verified === true) continue;
      nextByType.set(type, {
        id: type,
        type,
        labelEn: definition?.en || displayLabel,
        labelAr: definition?.ar || displayLabel,
        count,
        source: 'floor_plan_ai',
        confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw.confidence) : undefined,
        verified: false,
      });
    }

    const nextInventory = [...nextByType.values()];
    const extraPatch: Partial<PropertyData> = {
      floorPlan: {
        ...property.floorPlan,
        aiStatus: 'owner_applied',
        ownerConfirmedAt: new Date().toISOString(),
        verificationState: 'BIN_VISIT_VERIFICATION_PENDING',
      },
    };
    if (!(Number(property.floors) > 0) && Number(floorPlanAnalysis?.floorsDetected) > 0) {
      extraPatch.floors = Math.round(Number(floorPlanAnalysis.floorsDetected));
    }
    if (!(Number(property.sqft) > 0) && Number(floorPlanAnalysis?.measuredAreaSqft) > 0) {
      extraPatch.sqft = Math.round(Number(floorPlanAnalysis.measuredAreaSqft));
    }
    updateInventory(nextInventory, extraPatch);
  };

  const askAi = async (text: string, purpose: 'question' | 'description') => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setAiBusy(true);
    try {
      const result: any = await httpsCallable(functions, 'runSovereignAI')({
        text: purpose === 'description'
          ? `Rewrite this owner property description clearly and factually. Do not invent missing facts. Return only the improved description: ${cleanText}`
          : cleanText,
        pageContext: {
          page: 'owner-property-profile',
          propertyType: property.propertyType,
          emirate: property.emirate,
          area: property.area,
          floors: property.floors,
          measuredServiceAreaSqft: property.sqft,
          unitsOrCapacity: property.units,
          propertyAgeYears: property.age,
          assetGrade: property.assetGrade,
          spaceInventory: inventory.map((item) => ({ type: item.type, label: ar ? item.labelAr : item.labelEn, count: item.count, source: item.source, verified: item.verified })),
          calculatedSummary: intelligence,
          titleDeedStatus: property.titleDeedStatus,
          floorPlanStatus: property.floorPlan?.status || 'not_uploaded',
          floorPlanAiStatus: property.floorPlan?.aiStatus || 'not_analyzed',
        },
      });
      const answer = String(result.data?.text || '').trim();
      if (purpose === 'description') setImprovedDescription(answer);
      else setAiAnswer(answer);
    } catch (error) {
      console.error('Property profile AI request failed:', error);
      const fallback = label(
        'BIN AI is temporarily unavailable. Your property data is still saved and you can continue manually.',
        'مساعد BIN AI غير متاح مؤقتاً. بيانات العقار محفوظة ويمكنك المتابعة يدوياً.',
      );
      if (purpose === 'description') setImprovedDescription(fallback);
      else setAiAnswer(fallback);
    } finally {
      setAiBusy(false);
    }
  };

  if (!property.propertyType) return null;

  return (
    <Paper sx={{ p: { xs: 2.5, md: 4 }, mt: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" gap={2} alignItems="flex-start" flexWrap="wrap">
        <Box>
          <Typography variant="h5" fontWeight={950} color="#FFF">{label("What's inside this property?", 'ما الموجود داخل هذا العقار؟')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {label(
              `Because you selected ${property.propertyType}, we show the spaces normally relevant to this asset. Add only what actually exists. AI and documents may suggest values, but nothing becomes verified until the owner or BIN GROUP confirms it.`,
              `بما أنك اخترت ${property.propertyType}، نعرض المساحات المناسبة عادةً لهذا النوع. أضف فقط ما هو موجود فعلياً. قد يقترح الذكاء الاصطناعي والمستندات قيماً، لكنها لا تصبح موثقة حتى يؤكدها المالك أو BIN GROUP.`,
            )}
          </Typography>
        </Box>
        <Chip icon={<CheckCircle2 size={15} />} label={label('Owner-declared inventory', 'جرد مُصرّح به من المالك')} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.45) }} />
      </Stack>

      <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

      <Typography variant="subtitle1" fontWeight={900} color="#FFF" mb={1}>{label('1. Floor plan — optional', '1. مخطط الطابق — اختياري')}</Typography>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button component="label" variant="outlined" startIcon={floorPlanUploading ? <CircularProgress size={16} /> : <Upload size={17} />} disabled={floorPlanUploading || floorPlanAnalyzing} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>
          {property.floorPlan?.status === 'uploaded' ? label('Replace floor plan', 'استبدال مخطط الطابق') : label('Upload floor plan', 'رفع مخطط الطابق')}
          <input hidden type="file" accept="image/*,.pdf" onChange={uploadFloorPlan} />
        </Button>
        {property.floorPlan?.status === 'uploaded' && <Chip icon={<FileText size={15} />} label={property.floorPlan.name || label('Floor plan uploaded', 'تم رفع المخطط')} />}
        {(floorPlanUploading || floorPlanAnalyzing) && <Chip icon={<FileSearch size={15} />} label={label('AI is reading the floor plan…', 'الذكاء الاصطناعي يقرأ المخطط…')} />}
        <Typography variant="caption" color="text.secondary">{label('No floor plan? No problem — use the quick counters below.', 'لا يوجد مخطط؟ لا مشكلة — استخدم العدادات السريعة أدناه.')}</Typography>
      </Stack>
      {floorPlanError && <Alert severity="warning" sx={{ mt: 1.5 }}>{floorPlanError}</Alert>}

      {floorPlanAnalysis && <Paper sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}` }}>
        <Typography variant="subtitle2" fontWeight={900} color="#FFF">{label('AI found these floor-plan details — review before applying', 'وجد الذكاء الاصطناعي تفاصيل المخطط التالية — راجعها قبل التطبيق')}</Typography>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {Number(floorPlanAnalysis.floorsDetected) > 0 && <Chip label={`${label('Floors detected', 'الطوابق المكتشفة')}: ${floorPlanAnalysis.floorsDetected}`} />}
          {Number(floorPlanAnalysis.measuredAreaSqft) > 0 && <Chip label={`${label('Area detected', 'المساحة المكتشفة')}: ${Math.round(Number(floorPlanAnalysis.measuredAreaSqft)).toLocaleString()} ft²`} />}
          {(Array.isArray(floorPlanAnalysis.totals) ? floorPlanAnalysis.totals : []).map((item: any, index: number) => <Chip key={`${item?.type || 'space'}-${index}`} label={`${item?.label || item?.type || label('Space', 'مساحة')} × ${item?.count || 0}`} />)}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {label('Nothing above changes your property until you tap Use AI suggestions. Existing BIN-verified facts are never overwritten.', 'لن تتغير بيانات عقارك حتى تضغط استخدام اقتراحات الذكاء الاصطناعي. لا يتم استبدال البيانات الموثقة من BIN GROUP أبداً.')}
        </Typography>
        <Button variant="contained" sx={{ mt: 1.5, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} onClick={applyFloorPlanSuggestions} startIcon={<CheckCircle2 size={17} />}>
          {label('Use AI suggestions', 'استخدام اقتراحات الذكاء الاصطناعي')}
        </Button>
      </Paper>}

      <Typography variant="subtitle1" fontWeight={900} color="#FFF" mt={4} mb={1}>{label('2. Rooms, spaces & facilities', '2. الغرف والمساحات والمرافق')}</Typography>
      <Grid container spacing={1.5}>
        {suggestions.map((space) => {
          const count = countFor(space.id);
          return (
            <Grid item xs={12} sm={6} md={4} key={space.id}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: count > 0 ? alpha(binThemeTokens.gold, 0.07) : 'rgba(255,255,255,0.02)', borderColor: count > 0 ? alpha(binThemeTokens.gold, 0.35) : 'rgba(255,255,255,0.08)' }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="body2" fontWeight={800} color="#FFF">{ar ? space.ar : space.en}</Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <IconButton size="small" onClick={() => setCount(space.id, count - 1)} disabled={!count}><Minus size={16} /></IconButton>
                    <TextField value={count} type="number" onChange={(event) => setCount(space.id, Number(event.target.value))} inputProps={{ min: 0, style: { textAlign: 'center', width: 36, padding: 6 } }} size="small" sx={{ width: 68 }} />
                    <IconButton size="small" onClick={() => setCount(space.id, count + 1)}><Plus size={16} /></IconButton>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1} sx={{ mt: 2 }}>
        <TextField fullWidth size="small" label={label('Another space not listed', 'مساحة أخرى غير موجودة في القائمة')} value={customSpace} onChange={(event) => setCustomSpace(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomSpace(); } }} />
        <Button variant="outlined" onClick={addCustomSpace} startIcon={<Plus size={16} />} sx={{ minWidth: 180 }}>{label('Add another space', 'إضافة مساحة أخرى')}</Button>
      </Stack>

      {!!inventory.filter((item) => item.type.startsWith('custom_')).length && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
        {inventory.filter((item) => item.type.startsWith('custom_')).map((item) => <Chip key={item.id} label={`${ar ? item.labelAr : item.labelEn} × ${item.count}`} onDelete={() => updateInventory(inventory.filter((candidate) => candidate.id !== item.id))} deleteIcon={<X size={15} />} />)}
      </Stack>}

      <Typography variant="subtitle1" fontWeight={900} color="#FFF" mt={4} mb={1}>{label('3. Automatic property calculations', '3. حسابات العقار التلقائية')}</Typography>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`${label('Declared spaces', 'المساحات المصرح بها')}: ${intelligence.totalDeclaredSpaces}`} />
        <Chip label={`${label('Rooms', 'الغرف')}: ${intelligence.totalRoomSpaces}`} />
        <Chip label={`${label('Wet areas', 'المناطق الرطبة')}: ${intelligence.totalWetAreas}`} />
        <Chip label={`${label('Workspaces', 'مساحات العمل')}: ${intelligence.totalWorkspaces}`} />
        <Chip label={`${label('Service spaces', 'مساحات الخدمة')}: ${intelligence.totalServiceSpaces}`} />
        {intelligence.averageAreaPerFloorSqft !== null && <Chip label={`${label('Avg. area / floor', 'متوسط المساحة / طابق')}: ${intelligence.averageAreaPerFloorSqft.toLocaleString()} ft²`} />}
        {intelligence.serviceAreaPerUnitSqft !== null && <Chip label={`${label('Area / unit', 'المساحة / وحدة')}: ${intelligence.serviceAreaPerUnitSqft.toLocaleString()} ft²`} />}
        {intelligence.declaredSpacesPer1000Sqft !== null && <Chip label={`${label('Spaces / 1,000 ft²', 'المساحات / 1000 قدم²')}: ${intelligence.declaredSpacesPer1000Sqft}`} />}
        <Chip label={`${label('Age band', 'فئة العمر')}: ${intelligence.ageBand}`} />
      </Stack>
      {!!intelligence.warnings.length && <Alert severity="warning" sx={{ mt: 2 }}>{intelligence.warnings.join(' ')}</Alert>}

      <Typography variant="subtitle1" fontWeight={900} color="#FFF" mt={4} mb={1}>{label('4. Describe the property with BIN AI', '4. وصف العقار بمساعدة BIN AI')}</Typography>
      <TextField fullWidth multiline minRows={3} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder={label('Example: Two-floor Government Majlis with three halls, seven guest rooms, two offices, one kitchen and five bathrooms...', 'مثال: مجلس حكومي من طابقين يضم ثلاث قاعات وسبع غرف ضيوف ومكتبين ومطبخاً وخمسة حمامات...')} />
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1} sx={{ mt: 1.5 }}>
        <Button variant="contained" disabled={!descriptionDraft.trim() || aiBusy} onClick={() => askAi(descriptionDraft, 'description')} startIcon={aiBusy ? <CircularProgress size={16} /> : <Sparkles size={17} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>{label('Improve with AI', 'تحسين بالذكاء الاصطناعي')}</Button>
        <Button variant="outlined" onClick={() => onChange({ ownerPropertyDescription: descriptionDraft, propertyDescriptionSource: 'owner' })}>{label('Save my description', 'حفظ وصفي')}</Button>
      </Stack>
      {improvedDescription && <Paper sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
        <Typography variant="body2" color="#FFF" sx={{ whiteSpace: 'pre-wrap' }}>{improvedDescription}</Typography>
        <Button size="small" sx={{ mt: 1 }} onClick={() => { setDescriptionDraft(improvedDescription); onChange({ ownerPropertyDescription: improvedDescription, propertyDescriptionSource: 'ai_assisted_owner_confirmed' }); }}>{label('Use this description', 'استخدام هذا الوصف')}</Button>
      </Paper>}

      <Typography variant="subtitle1" fontWeight={900} color="#FFF" mt={4} mb={1}>{label('5. Ask BIN AI anything about this step', '5. اسأل BIN AI أي شيء عن هذه الخطوة')}</Typography>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1}>
        <TextField fullWidth value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder={label('What am I missing? What does measured service area mean? Which rooms should I add?', 'ما الذي ينقصني؟ ما معنى مساحة الخدمة المقاسة؟ ما الغرف التي يجب إضافتها؟')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAi(aiQuestion, 'question'); } }} />
        <Button variant="outlined" disabled={!aiQuestion.trim() || aiBusy} onClick={() => askAi(aiQuestion, 'question')} startIcon={<Bot size={17} />} sx={{ minWidth: 150 }}>{label('Ask BIN AI', 'اسأل BIN AI')}</Button>
      </Stack>
      {aiAnswer && <Alert severity="info" sx={{ mt: 1.5 }}>{aiAnswer}</Alert>}

      <Typography variant="caption" sx={{ display: 'block', mt: 3, color: 'text.secondary' }}>
        {label(
          'Data authority: AI suggestions and uploaded documents never silently overwrite owner-confirmed or BIN-verified facts. Final inventory is verified during the BIN GROUP property visit.',
          'مرجعية البيانات: اقتراحات الذكاء الاصطناعي والمستندات المرفوعة لا تستبدل بصمت البيانات التي أكدها المالك أو وثقتها BIN GROUP. يتم التحقق من الجرد النهائي أثناء زيارة العقار.',
        )}
      </Typography>
    </Paper>
  );
};

export default PropertyInventoryPanel;
