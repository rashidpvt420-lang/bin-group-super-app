from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    "): Promise<void> => {\n    const readiness = await getGpsReadiness();",
    "): Promise<boolean> => {\n    const readiness = await getGpsReadiness();",
    'start return type',
)
tracking = replace_once(
    tracking,
    """        onError?.(message);
        return;
    }

    if (!readiness.secureContext) {
""",
    """        onError?.(message);
        return false;
    }

    if (!readiness.secureContext) {
""",
    'unsupported result',
)
tracking = replace_once(
    tracking,
    """        onError?.(message);
        return;
    }

    purgeOtherTechnicianQueues(technicianUid);
""",
    """        onError?.(message);
        return false;
    }

    purgeOtherTechnicianQueues(technicianUid);
""",
    'insecure context result',
)
tracking = replace_once(
    tracking,
    """        {
            enableHighAccuracy: true,
            maximumAge: 15_000,
            timeout: 27_000,
        },
    );
};
""",
    """        {
            enableHighAccuracy: true,
            maximumAge: 15_000,
            timeout: 27_000,
        },
    );
    return true;
};
""",
    'watch installed result',
)
tracking_path.write_text(tracking, encoding='utf-8')

page_path = Path('src/technician/pages/TechnicianJobDetailPage.tsx')
page = page_path.read_text(encoding='utf-8')
page = replace_once(
    page,
    """                    await startLiveTracking(id, user.uid, () => undefined, (err) => {
                        setGpsError(err);
                        setIsTracking(false);
                    });
                    setIsTracking(true);
""",
    """                    const trackingStarted = await startLiveTracking(id, user.uid, () => undefined, (err) => {
                        setGpsError(err);
                        setIsTracking(false);
                    });
                    setIsTracking(trackingStarted);
                    if (!trackingStarted) {
                        setGpsError('Mission is en route, but this device did not start a live GPS watch.');
                    }
""",
    'truthful caller state',
)
page_path.write_text(page, encoding='utf-8')

test_path = Path('tests/launch/gps-queue-durability-privacy.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source += """

test('Technician UI marks GPS active only after a watch is installed', () => {
  const page = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');
  assert.match(tracking, /Promise<boolean>/);
  assert.match(tracking, /Geolocation is not supported[\\s\\S]*return false/);
  assert.match(tracking, /GPS requires a secure HTTPS context[\\s\\S]*return false/);
  assert.match(tracking, /navigator\\.geolocation\\.watchPosition[\\s\\S]*return true/);
  assert.match(page, /const trackingStarted = await startLiveTracking/);
  assert.match(page, /setIsTracking\\(trackingStarted\\)/);
  assert.doesNotMatch(page, /await startLiveTracking[\\s\\S]{0,250}setIsTracking\\(true\\)/);
});
"""
test_path.write_text(test_source, encoding='utf-8')
