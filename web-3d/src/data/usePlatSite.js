import { useEffect, useState } from 'react';
import { loadPlatSite } from './platAdapter';

export function usePlatSite(sheetId = 'sheet1') {
  const [site, setSite] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadPlatSite(sheetId)
      .then((data) => {
        if (!cancelled) {
          setSite(data);
          setLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sheetId]);

  return { site, error, loading };
}
