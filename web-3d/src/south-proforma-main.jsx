import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ProformaPage, { loadMainProformaDefaults } from './pages/ProformaPage';
import { configureAssumptionStorage } from './proforma/assumptions';
import { computeProforma } from './proforma/computeProforma';
import {
  CONCEPT_OPTIONS,
  SOUTH_NAV_LINKS,
  SOUTH_OVERRIDES_KEY,
  buildSiteModel,
  buildSouthDefaults,
  loadConcepts,
  readInitialConcept,
  rememberConcept,
} from './southParcel/southParcelSite';
import './index.css';
import './proforma.css';

configureAssumptionStorage(SOUTH_OVERRIDES_KEY);

const SOUTH_PROFORMA_SITE = {
  title: 'South Parcel Proforma',
  subtitle: (result) => `${result.meta.siteName} · land south of Jasper Drive · ${result.meta.ordinanceRef.title}`,
  navCurrent: 'south-proforma',
  navLinks: SOUTH_NAV_LINKS,
  variants: CONCEPT_OPTIONS,
  initialVariant: readInitialConcept,
  onVariantChange: rememberConcept,
  load: async () => {
    const [mainDefaults, concepts] = await Promise.all([loadMainProformaDefaults(), loadConcepts()]);
    return { defaults: buildSouthDefaults(mainDefaults), inputs: { concepts } };
  },
  compute: (merged, inputs, conceptId) =>
    computeProforma({
      defaults: merged,
      siteModel: buildSiteModel(inputs.concepts, conceptId),
      phaseOrder: merged.phaseOrder,
    }),
};

function SouthProformaRoot() {
  useEffect(() => {
    document.documentElement.classList.add('proforma-page');
    return () => document.documentElement.classList.remove('proforma-page');
  }, []);

  return <ProformaPage site={SOUTH_PROFORMA_SITE} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SouthProformaRoot />
  </StrictMode>,
);
