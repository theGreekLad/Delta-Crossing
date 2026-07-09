import React from 'react';
import { getDesignById } from '../../data/buildingCatalog';
import FourplexModel from './FourplexModel';
import SingleFamilyModel from './SingleFamilyModel';

export default function PlacedBuilding({ designId, center, rotation }) {
  const design = getDesignById(designId);
  if (!design) return null;

  if (design.category === 'single-family') {
    return <SingleFamilyModel designId={designId} center={center} rotation={rotation} />;
  }

  return <FourplexModel designId={designId} center={center} rotation={rotation} />;
}
