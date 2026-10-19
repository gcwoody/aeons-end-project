import type { SubBoardAnchor, SubBoardImageOption, SubBoardRegion } from './sub-board-layout'
import normalBoardImage from '../../../image-database/cards/wave9/nemesis/The Terror in Brass/Worldsplitter Track Normal.png'
import increasedBoardImage from '../../../image-database/cards/wave9/nemesis/The Terror in Brass/Worldsplitter Track ID.png'

function createRegions(
  armorX: number,
  armorWidth: number,
  armorY: number[],
  trackX: number,
  trackWidth: number,
  trackY: number[],
): SubBoardRegion[] {
  const armorRegions = armorY.map((y, index) => ({
    id: `armor-${index + 1}`,
    label: `Armor space ${index + 1}`,
    x: armorX,
    y,
    width: armorWidth,
    height: 13.5,
  }))
  const trackRegions = trackY.map((y, index) => ({
    id: `track-space-${5 - index}`,
    label: `Track space ${5 - index}`,
    x: trackX,
    y,
    width: trackWidth,
    height: 13.5,
  }))

  return [
    ...armorRegions,
    ...trackRegions,
    {
      id: 'track-start',
      label: 'Track Start',
      x: trackX,
      y: 84.5,
      width: trackWidth,
      height: 12,
    },
  ]
}

function createAnchors(armorX: number, armorY: number[], trackX: number, trackY: number[]): SubBoardAnchor[] {
  const armorAnchors = armorY.map((y, index) => ({
    id: `nemesis-token-armor-${index + 1}`,
    label: `Nemesis token · Armor ${index + 1}`,
    regionId: `armor-${index + 1}`,
    x: armorX,
    y: y + 6.75,
    tokenSize: { width: 4, height: 4 },
  }))
  const trackAnchors = trackY.map((y, index) => ({
    id: `terror-standee-track-${5 - index}`,
    label: `Terror standee · Track ${5 - index}`,
    regionId: `track-space-${5 - index}`,
    x: trackX,
    y: y + 6.75,
    tokenSize: { width: 4, height: 4 },
  }))

  return [
    ...armorAnchors,
    ...trackAnchors,
    {
      id: 'terror-standee-start', label: 'Terror standee · Start', regionId: 'track-start',
      x: trackX, y: 90.5, tokenSize: { width: 4, height: 4 },
    },
  ]
}

const normalArmorY = [18, 32.5, 47, 61.5, 76]
const normalTrackY = [10, 24.5, 39, 53.5, 68]
const increasedArmorY = [15, 30, 45, 60, 75]
const increasedTrackY = [9, 24, 39, 54, 69]

export const terrorSubBoardExamples: SubBoardImageOption[] = [
  {
    id: 'terror-normal',
    label: 'The Terror in Brass · Normal',
    imageUrl: normalBoardImage,
    imageFile: 'Worldsplitter Track Normal.png',
    width: 1903,
    height: 1786,
    starterLayout: {
      regions: createRegions(50.5, 47, normalArmorY, 5, 40, normalTrackY),
      anchors: createAnchors(58, normalArmorY, 25, normalTrackY),
    },
  },
  {
    id: 'terror-increased',
    label: 'The Terror in Brass · Increased difficulty',
    imageUrl: increasedBoardImage,
    imageFile: 'Worldsplitter Track ID.png',
    width: 1899,
    height: 1778,
    starterLayout: {
      regions: createRegions(3, 47, increasedArmorY, 53, 43, increasedTrackY),
      anchors: createAnchors(42, increasedArmorY, 75, increasedTrackY),
    },
  },
]
