const fs = require("fs");

const file = "src/components/onboarding/PropertyLocationStep.tsx";
const text = fs.readFileSync(file, "utf8");

const startMarker = "                            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.22)' }}>";
const locationErrorMarker = "{locationError && <Alert severity=\"warning\">";

const start = text.indexOf(startMarker);
if (start === -1) {
  throw new Error("Could not find old fallback Paper start.");
}

const locationErrorIndex = text.indexOf(locationErrorMarker, start);
if (locationErrorIndex === -1) {
  throw new Error("Could not find locationError marker after fallback block.");
}

const endPaperStart = text.lastIndexOf("                            </Paper>", locationErrorIndex);
if (endPaperStart === -1 || endPaperStart < start) {
  throw new Error("Could not find fallback Paper closing tag.");
}

const end = endPaperStart + "                            </Paper>".length;

const replacement = [
"                            <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.22)', overflow: 'hidden' }}>",
"                                <Box sx={{ p: 2.5, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>",
"                                    <Box>",
"                                        <Typography variant=\"h6\" sx={{ color: '#FFF', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>",
"                                            <Navigation size={20} color={binThemeTokens.gold} /> Live coordinate map preview",
"                                        </Typography>",
"                                        <Typography variant=\"body2\" sx={{ color: 'rgba(255,255,255,0.62)' }}>",
"                                            Google Maps embedded preview is unavailable on this domain, so this step uses a live coordinate map preview. Save coordinates here; technicians still open the exact property location in Google Maps.",
"                                        </Typography>",
"                                    </Box>",
"                                    <Button href={googleMapsUrl} target=\"_blank\" rel=\"noreferrer\" variant=\"contained\" startIcon={<ExternalLink size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>",
"                                        Open Google Maps",
"                                    </Button>",
"                                </Box>",
"",
"                                <Box sx={{ height: { xs: 260, md: 340 }, width: '100%', bgcolor: '#050505', borderTop: '1px solid rgba(198,167,94,0.16)' }}>",
"                                    <Box",
"                                        component=\"iframe\"",
"                                        title=\"Property coordinate map preview\"",
"                                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(manualLng) - 0.004},${Number(manualLat) - 0.004},${Number(manualLng) + 0.004},${Number(manualLat) + 0.004}&layer=mapnik&marker=${Number(manualLat)},${Number(manualLng)}`}",
"                                        loading=\"lazy\"",
"                                        sx={{ width: '100%', height: '100%', border: 0 }}",
"                                    />",
"                                </Box>",
"",
"                                {mapFailureReason && mapFailureReason !== 'EMBEDDED_GOOGLE_MAPS_DISABLED' && (",
"                                    <Typography variant=\"caption\" sx={{ display: 'block', px: 2.5, py: 1.5, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>",
"                                        Diagnostic: {mapFailureReason}",
"                                    </Typography>",
"                                )}",
"                            </Paper>"
].join("\n");

const next = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, next, "utf8");

console.log("Patched map fallback successfully.");
