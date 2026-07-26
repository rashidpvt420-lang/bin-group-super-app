from pathlib import Path

path = Path('.github/scripts/build-map-gps-client-hardening-final.py')
source = path.read_text(encoding='utf-8')
start = source.index("controls_path = Path('src/components/PortalSessionControls.tsx')")
end = source.index("test_path = Path('tests/launch/maps-gps-product-truth.test.mjs')", start)
source = source[:start] + source[end:]
source = source.replace('if (initialPointCount == 1)', 'if (initialPointCount === 1)')
path.write_text(source, encoding='utf-8')
