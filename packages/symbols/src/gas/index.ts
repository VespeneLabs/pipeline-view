import type { SymbolDef } from '@pipeline-view/core';
import { gateValve } from './gate-valve';
import { ballValve } from './ball-valve';
import { globeValve } from './globe-valve';
import { plugValve } from './plug-valve';
import { butterflyValve } from './butterfly-valve';
import { swingCheckValve } from './swing-check-valve';
import { needleValve } from './needle-valve';
import { diaphragmValve } from './diaphragm-valve';
import { threeWayPlugValve } from './three-way-plug-valve';
import { angleGlobeValve } from './angle-globe-valve';
import { handOperatedGateValve } from './hand-operated-gate-valve';
import { pneumaticGlobeValve } from './pneumatic-globe-valve';
import { motorOperatedBallValve } from './motor-operated-ball-valve';
import { solenoidValve } from './solenoid-valve';
import { pistonActuatedGateValve } from './piston-actuated-gate-valve';
import { pressureReducingRegulator } from './pressure-reducing-regulator';
import { backPressureRegulator } from './back-pressure-regulator';
import { pressureSafetyValve } from './pressure-safety-valve';
import { ruptureDisc } from './rupture-disc';
import { shutdownValve } from './shutdown-valve';
import { centrifugalCompressor } from './centrifugal-compressor';
import { reciprocatingCompressor } from './reciprocating-compressor';
import { screwCompressor } from './screw-compressor';
import { verticalVessel } from './vertical-vessel';
import { horizontalDrum } from './horizontal-drum';
import { knockoutDrum } from './knockout-drum';
import { cartridgeGasFilter } from './cartridge-gas-filter';
import { shellAndTubeExchanger } from './shell-and-tube-exchanger';
import { airCooledExchanger } from './air-cooled-exchanger';
import { flareStack } from './flare-stack';
import { pressureIndicator } from './pressure-indicator';
import { pressureTransmitter } from './pressure-transmitter';
import { differentialPressureTransmitter } from './differential-pressure-transmitter';
import { temperatureIndicator } from './temperature-indicator';
import { temperatureTransmitter } from './temperature-transmitter';
import { flowTransmitter } from './flow-transmitter';
import { flowIndicatingController } from './flow-indicating-controller';
import { levelTransmitter } from './level-transmitter';
import { highHighLevelSwitch } from './high-high-level-switch';
import { gasAnalyzerTransmitter } from './gas-analyzer-transmitter';
import { flowArrow } from './flow-arrow';
import { connectedBranch } from './connected-branch';
import { crossing } from './crossing';
import { flangedConnection } from './flanged-connection';
import { orificePlate } from './orifice-plate';
import { concentricReducer } from './concentric-reducer';
import { yStrainer } from './y-strainer';
import { flameArrester } from './flame-arrester';
import { electricalSignal } from './electrical-signal';
import { pneumaticSignal } from './pneumatic-signal';

export {
  gateValve,
  ballValve,
  globeValve,
  plugValve,
  butterflyValve,
  swingCheckValve,
  needleValve,
  diaphragmValve,
  threeWayPlugValve,
  angleGlobeValve,
  handOperatedGateValve,
  pneumaticGlobeValve,
  motorOperatedBallValve,
  solenoidValve,
  pistonActuatedGateValve,
  pressureReducingRegulator,
  backPressureRegulator,
  pressureSafetyValve,
  ruptureDisc,
  shutdownValve,
  centrifugalCompressor,
  reciprocatingCompressor,
  screwCompressor,
  verticalVessel,
  horizontalDrum,
  knockoutDrum,
  cartridgeGasFilter,
  shellAndTubeExchanger,
  airCooledExchanger,
  flareStack,
  pressureIndicator,
  pressureTransmitter,
  differentialPressureTransmitter,
  temperatureIndicator,
  temperatureTransmitter,
  flowTransmitter,
  flowIndicatingController,
  levelTransmitter,
  highHighLevelSwitch,
  gasAnalyzerTransmitter,
  flowArrow,
  connectedBranch,
  crossing,
  flangedConnection,
  orificePlate,
  concentricReducer,
  yStrainer,
  flameArrester,
  electricalSignal,
  pneumaticSignal,
};

/** All 50 gas-service P&ID symbols, in Figma reference order (01–50). */
export const gasSymbols: SymbolDef[] = [
  gateValve,
  ballValve,
  globeValve,
  plugValve,
  butterflyValve,
  swingCheckValve,
  needleValve,
  diaphragmValve,
  threeWayPlugValve,
  angleGlobeValve,
  handOperatedGateValve,
  pneumaticGlobeValve,
  motorOperatedBallValve,
  solenoidValve,
  pistonActuatedGateValve,
  pressureReducingRegulator,
  backPressureRegulator,
  pressureSafetyValve,
  ruptureDisc,
  shutdownValve,
  centrifugalCompressor,
  reciprocatingCompressor,
  screwCompressor,
  verticalVessel,
  horizontalDrum,
  knockoutDrum,
  cartridgeGasFilter,
  shellAndTubeExchanger,
  airCooledExchanger,
  flareStack,
  pressureIndicator,
  pressureTransmitter,
  differentialPressureTransmitter,
  temperatureIndicator,
  temperatureTransmitter,
  flowTransmitter,
  flowIndicatingController,
  levelTransmitter,
  highHighLevelSwitch,
  gasAnalyzerTransmitter,
  flowArrow,
  connectedBranch,
  crossing,
  flangedConnection,
  orificePlate,
  concentricReducer,
  yStrainer,
  flameArrester,
  electricalSignal,
  pneumaticSignal,
];
