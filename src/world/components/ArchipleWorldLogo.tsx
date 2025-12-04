/**
 * ArchipleWorldLogo - Logo component with theme color support
 */

import React from 'react';
import type { ArchipleWorldLogoProps } from '../types';

const ArchipleWorldLogo: React.FC<ArchipleWorldLogoProps> = ({ color = '#10b981', height = 32 }) => {
  // Use mask-image to apply theme color directly to SVG
  return (
    <div
      style={{
        height: `${height}px`,
        width: `${height * 7}px`,
        backgroundColor: color,
        WebkitMaskImage: 'url(/images/world-logo.svg)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskImage: 'url(/images/world-logo.svg)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        display: 'block',
      }}
      role="img"
      aria-label="ARCHIPLE WORLD"
    />
  );
};

export default ArchipleWorldLogo;
