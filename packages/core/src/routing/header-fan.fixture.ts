/**
 * Routing fixture from a host's installation drawing (1.5.0): an 8-outlet header fanning out to a
 * column of inline instruments, plus a 5-outlet header downstream. Geometry only: node boxes and
 * port endpoints, as the renderer would request them.
 */
import type { Rect } from '../model/types';
import type { RouteRequest } from './types';

export const headerFan: { obstacles: [string, Rect][]; requests: RouteRequest[] } = {
  obstacles: [
    ['N0', { x: 32, y: 464, width: 96, height: 36 }],
    ['N1', { x: 336, y: 427, width: 80, height: 88 }],
    ['N2', { x: 624, y: 427, width: 80, height: 88 }],
    ['N3', { x: 896, y: 427, width: 80, height: 88 }],
    ['N4', { x: 1184, y: 427, width: 80, height: 88 }],
    ['N5', { x: 1744, y: -23, width: 80, height: 88 }],
    ['N6', { x: 2016, y: -8, width: 64, height: 56 }],
    ['N7', { x: 1744, y: 97, width: 80, height: 88 }],
    ['N8', { x: 2016, y: 112, width: 64, height: 56 }],
    ['N9', { x: 1744, y: 217, width: 80, height: 88 }],
    ['N10', { x: 2016, y: 232, width: 64, height: 56 }],
    ['N11', { x: 1744, y: 337, width: 80, height: 88 }],
    ['N12', { x: 2016, y: 352, width: 64, height: 56 }],
    ['N13', { x: 1744, y: 457, width: 80, height: 88 }],
    ['N14', { x: 2016, y: 472, width: 64, height: 56 }],
    ['N15', { x: 1744, y: 577, width: 80, height: 88 }],
    ['N16', { x: 2016, y: 592, width: 64, height: 56 }],
    ['N17', { x: 1744, y: 697, width: 80, height: 88 }],
    ['N18', { x: 2016, y: 712, width: 64, height: 56 }],
    ['N19', { x: 2016, y: 817, width: 80, height: 88 }],
    ['N20', { x: 2288, y: 832, width: 64, height: 56 }],
    ['N21', { x: 2016, y: 937, width: 80, height: 88 }],
    ['N22', { x: 2288, y: 952, width: 64, height: 56 }],
    ['N23', { x: 2016, y: 1057, width: 80, height: 88 }],
    ['N24', { x: 2288, y: 1072, width: 64, height: 56 }],
    ['N25', { x: 2016, y: 1177, width: 80, height: 88 }],
    ['N26', { x: 2288, y: 1192, width: 64, height: 56 }],
    ['N27', { x: 2016, y: 1297, width: 80, height: 88 }],
    ['N28', { x: 2288, y: 1312, width: 64, height: 56 }],
    ['H8', { x: 1440, y: 486, width: 40, height: 216 }],
    ['H5', { x: 1728, y: 1104, width: 40, height: 144 }],
  ],
  requests: [
    {
      linkId: 'L0',
      from: { nodeId: 'N0', point: { x: 127, y: 482 }, direction: 'right' },
      to: { nodeId: 'N1', point: { x: 336, y: 506 }, direction: 'left' },
    },
    {
      linkId: 'L1',
      from: { nodeId: 'N1', point: { x: 416, y: 506 }, direction: 'right' },
      to: { nodeId: 'N2', point: { x: 624, y: 506 }, direction: 'left' },
    },
    {
      linkId: 'L2',
      from: { nodeId: 'N2', point: { x: 704, y: 506 }, direction: 'right' },
      to: { nodeId: 'N3', point: { x: 896, y: 506 }, direction: 'left' },
    },
    {
      linkId: 'L3',
      from: { nodeId: 'N3', point: { x: 976, y: 506 }, direction: 'right' },
      to: { nodeId: 'N4', point: { x: 1184, y: 506 }, direction: 'left' },
    },
    {
      linkId: 'L4',
      from: { nodeId: 'N4', point: { x: 1264, y: 506 }, direction: 'right' },
      to: { nodeId: 'H8', point: { x: 1440, y: 594 }, direction: 'left' },
    },
    {
      linkId: 'L5',
      from: { nodeId: 'N5', point: { x: 1824, y: 56 }, direction: 'right' },
      to: { nodeId: 'N6', point: { x: 2016, y: 32 }, direction: 'left' },
    },
    {
      linkId: 'L6',
      from: { nodeId: 'N7', point: { x: 1824, y: 176 }, direction: 'right' },
      to: { nodeId: 'N8', point: { x: 2016, y: 152 }, direction: 'left' },
    },
    {
      linkId: 'L7',
      from: { nodeId: 'N9', point: { x: 1824, y: 296 }, direction: 'right' },
      to: { nodeId: 'N10', point: { x: 2016, y: 272 }, direction: 'left' },
    },
    {
      linkId: 'L8',
      from: { nodeId: 'N11', point: { x: 1824, y: 416 }, direction: 'right' },
      to: { nodeId: 'N12', point: { x: 2016, y: 392 }, direction: 'left' },
    },
    {
      linkId: 'L9',
      from: { nodeId: 'N13', point: { x: 1824, y: 536 }, direction: 'right' },
      to: { nodeId: 'N14', point: { x: 2016, y: 512 }, direction: 'left' },
    },
    {
      linkId: 'L10',
      from: { nodeId: 'N15', point: { x: 1824, y: 656 }, direction: 'right' },
      to: { nodeId: 'N16', point: { x: 2016, y: 632 }, direction: 'left' },
    },
    {
      linkId: 'L11',
      from: { nodeId: 'N17', point: { x: 1824, y: 776 }, direction: 'right' },
      to: { nodeId: 'N18', point: { x: 2016, y: 752 }, direction: 'left' },
    },
    {
      linkId: 'L12',
      from: { nodeId: 'N19', point: { x: 2096, y: 896 }, direction: 'right' },
      to: { nodeId: 'N20', point: { x: 2288, y: 872 }, direction: 'left' },
    },
    {
      linkId: 'L13',
      from: { nodeId: 'N21', point: { x: 2096, y: 1016 }, direction: 'right' },
      to: { nodeId: 'N22', point: { x: 2288, y: 992 }, direction: 'left' },
    },
    {
      linkId: 'L14',
      from: { nodeId: 'N23', point: { x: 2096, y: 1136 }, direction: 'right' },
      to: { nodeId: 'N24', point: { x: 2288, y: 1112 }, direction: 'left' },
    },
    {
      linkId: 'L15',
      from: { nodeId: 'N25', point: { x: 2096, y: 1256 }, direction: 'right' },
      to: { nodeId: 'N26', point: { x: 2288, y: 1232 }, direction: 'left' },
    },
    {
      linkId: 'L16',
      from: { nodeId: 'N27', point: { x: 2096, y: 1376 }, direction: 'right' },
      to: { nodeId: 'N28', point: { x: 2288, y: 1352 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-1',
      from: { nodeId: 'H8', point: { x: 1480, y: 510 }, direction: 'right' },
      to: { nodeId: 'N5', point: { x: 1744, y: 56 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-2',
      from: { nodeId: 'H8', point: { x: 1480, y: 534 }, direction: 'right' },
      to: { nodeId: 'N7', point: { x: 1744, y: 176 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-3',
      from: { nodeId: 'H8', point: { x: 1480, y: 558 }, direction: 'right' },
      to: { nodeId: 'N9', point: { x: 1744, y: 296 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-4',
      from: { nodeId: 'H8', point: { x: 1480, y: 582 }, direction: 'right' },
      to: { nodeId: 'N11', point: { x: 1744, y: 416 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-5',
      from: { nodeId: 'H8', point: { x: 1480, y: 606 }, direction: 'right' },
      to: { nodeId: 'N13', point: { x: 1744, y: 536 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-6',
      from: { nodeId: 'H8', point: { x: 1480, y: 630 }, direction: 'right' },
      to: { nodeId: 'N15', point: { x: 1744, y: 656 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-7',
      from: { nodeId: 'H8', point: { x: 1480, y: 654 }, direction: 'right' },
      to: { nodeId: 'N17', point: { x: 1744, y: 776 }, direction: 'left' },
    },
    {
      linkId: 'H8.out-8',
      from: { nodeId: 'H8', point: { x: 1480, y: 678 }, direction: 'right' },
      to: { nodeId: 'H5', point: { x: 1728, y: 1176 }, direction: 'left' },
    },
    {
      linkId: 'L25',
      from: { nodeId: 'H5', point: { x: 1768, y: 1128 }, direction: 'right' },
      to: { nodeId: 'N19', point: { x: 2016, y: 896 }, direction: 'left' },
    },
    {
      linkId: 'L26',
      from: { nodeId: 'H5', point: { x: 1768, y: 1152 }, direction: 'right' },
      to: { nodeId: 'N21', point: { x: 2016, y: 1016 }, direction: 'left' },
    },
    {
      linkId: 'L27',
      from: { nodeId: 'H5', point: { x: 1768, y: 1176 }, direction: 'right' },
      to: { nodeId: 'N23', point: { x: 2016, y: 1136 }, direction: 'left' },
    },
    {
      linkId: 'L28',
      from: { nodeId: 'H5', point: { x: 1768, y: 1200 }, direction: 'right' },
      to: { nodeId: 'N25', point: { x: 2016, y: 1256 }, direction: 'left' },
    },
    {
      linkId: 'L29',
      from: { nodeId: 'H5', point: { x: 1768, y: 1224 }, direction: 'right' },
      to: { nodeId: 'N27', point: { x: 2016, y: 1376 }, direction: 'left' },
    },
  ],
};
