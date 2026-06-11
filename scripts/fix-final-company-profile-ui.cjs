const fs = require("fs");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
  console.log("fixed " + file);
}

/* 1) Stronger but still subtle watermark */
write("src/components/BrandWatermark.tsx", `import React from 'react';
import { Box, alpha } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrandWatermarkProps = {
  label?: string;
  opacity?: number;
  compact?: boolean;
};

export default function BrandWatermark({ label = 'BIN GROUP', opacity = 0.06, compact = false }: BrandWatermarkProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        pointerEvents: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          fontWeight: 950,
          letterSpacing: { xs: 10, md: 24 },
          fontSize: { xs: '5.8rem', sm: '9rem', md: '13rem' },
          lineHeight: 0.9,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          color: 'rgba(191,157,65,0.9)',
          opacity,
          transform: 'rotate(-12deg)',
          textShadow: \`0 0 48px \${alpha(binThemeTokens.gold, 0.18)}\`,
        }}
      >
        {label}
      </Box>

      <Box
        sx={{
          width: { xs: compact ? 270 : 360, sm: compact ? 380 : 520, md: compact ? 520 : 720 },
          height: { xs: compact ? 270 : 360, sm: compact ? 380 : 520, md: compact ? 520 : 720 },
          borderRadius: '50%',
          border: \`2px solid \${alpha(binThemeTokens.gold, 0.26)}\`,
          opacity: opacity * 0.82,
          transform: 'rotate(-12deg)',
          background: \`radial-gradient(circle, \${alpha(binThemeTokens.gold, 0.18)} 0%, transparent 66%)\`,
          boxShadow: \`0 0 150px \${alpha(binThemeTokens.gold, 0.16)}\`,
        }}
      />
    </Box>
  );
}
`);

/* 2) Homepage watermark opacity */
let publicPage = read("src/pages/public/PublicMarketingPage.tsx");
publicPage = publicPage.replaceAll("<BrandWatermark opacity={0.035} />", "<BrandWatermark opacity={0.06} />");
write("src/pages/public/PublicMarketingPage.tsx", publicPage);

/* 3) Company profile page fixes */
let company = read("src/pages/public/CompanyProfilePage.tsx");

/* Add LogIn import */
company = company.replace(
  "  Home,\n  Mail,",
  "  Home,\n  LogIn,\n  Mail,"
);

/* Add navLogin copy */
company = company.replace(
  "    navStart: ar ? 'ابدأ تفاصيل العقار' : 'Start Property Details',",
  "    navStart: ar ? 'ابدأ تفاصيل العقار' : 'Start Property Details',\n    navLogin: ar ? 'دخول البوابة' : 'Portal Login',"
);

/* Stronger watermark on company page */
company = company.replaceAll("<BrandWatermark opacity={0.035} />", "<BrandWatermark opacity={0.06} />");

/* Add Portal Login button between Start Property Details and Demo Reel */
company = company.replace(
  "            <NavButton onClick={() => navigate('/onboarding')} contained>{copy.navStart}</NavButton>\n            <NavButton onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} icon={<PlayCircle size={17} />}>{copy.navDemo}</NavButton>",
  "            <NavButton onClick={() => navigate('/onboarding')} contained>{copy.navStart}</NavButton>\n            <NavButton onClick={() => navigate('/login')} icon={<LogIn size={17} />}>{copy.navLogin}</NavButton>\n            <NavButton onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} icon={<PlayCircle size={17} />}>{copy.navDemo}</NavButton>"
);

/* Improve Executive Contact card */
company = company.replace(
  "          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, bgcolor: '#111827', color: '#fff' }}>",
  "          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, bgcolor: '#111827', color: '#fff', border: '1px solid rgba(212,175,55,.30)', boxShadow: '0 24px 70px rgba(17,24,39,.18)' }}>"
);

/* Force contact text visible */
company = company.replaceAll(
  "<Typography>{CONTACT.phone}</Typography>",
  "<Typography sx={{ color: '#FFFFFF', fontWeight: 850, wordBreak: 'break-word' }}>{CONTACT.phone}</Typography>"
);

company = company.replaceAll(
  "<Typography>{CONTACT.whatsapp}</Typography>",
  "<Typography sx={{ color: '#FFFFFF', fontWeight: 850, wordBreak: 'break-word' }}>{CONTACT.whatsapp}</Typography>"
);

company = company.replaceAll(
  "<Typography>{CONTACT.email}</Typography>",
  "<Typography sx={{ color: '#FFFFFF', fontWeight: 850, wordBreak: 'break-word' }}>{CONTACT.email}</Typography>"
);

company = company.replaceAll(
  "<Typography>{copy.location}</Typography>",
  "<Typography sx={{ color: '#FFFFFF', fontWeight: 850, wordBreak: 'break-word' }}>{copy.location}</Typography>"
);

company = company.replaceAll(
  "<Typography>Owner request → quote → contract → verified service record</Typography>",
  "<Typography sx={{ color: '#FFFFFF', fontWeight: 850, wordBreak: 'break-word' }}>Owner request → quote → contract → verified service record</Typography>"
);

write("src/pages/public/CompanyProfilePage.tsx", company);

console.log("Final company profile UI fix applied.");
