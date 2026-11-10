import { EQUIPMENT, port, sym } from '../shared';

/** 29 · Air-cooled exchanger. */
export const airCooledExchanger = /* @__PURE__ */ sym({
  type: 'gas/air-cooled-exchanger',
  ref: 29,
  name: 'Air-cooled exchanger',
  category: EQUIPMENT,
  size: [114, 71],
  ports: [port('in', 1, 42.97, 'left'), port('out', 113, 42.97, 'right')],
  parts: [
    {
      d: 'M13 36.97H101M13 47.97H101M1 42.97H13M101 42.97H113M57 29.97V7.97M19 55.97V69.97M95 55.97V69.97M13 29.97H101V55.97H13V29.97Z',
    },
    {
      d: 'M43.29 12.66C49.52 14.93 55.33 14.66 56.28 12.07C57.22 9.47 52.94 5.53 46.71 3.27C40.48 1 34.67 1.27 33.72 3.86C32.78 6.46 37.06 10.4 43.29 12.66Z',
    },
    {
      d: 'M70.71 12.66C76.94 10.4 81.22 6.46 80.28 3.86C79.33 1.27 73.52 1 67.29 3.27C61.06 5.53 56.78 9.47 57.72 12.07C58.67 14.66 64.48 14.93 70.71 12.66Z',
    },
  ],
  keywords: ['fin-fan', 'aftercooler'],
});
