export interface Corridor {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly importanceScore: number;
  readonly active: boolean;
}

export interface Section {
  readonly id: string;
  readonly corridorId: string;
  readonly code: string;
  readonly name: string;
  readonly sequenceNumber: number;
  readonly startKm: string;
  readonly endKm: string;
  readonly lineType: 'SINGLE' | 'DOUBLE' | 'MULTIPLE';
  readonly electrified: boolean;
  readonly corridorCode?: string;
}

export interface TrainMovement {
  readonly id: string;
  readonly trainNumber: string;
  readonly trainType: 'PASSENGER' | 'FREIGHT';
  readonly priorityClass: number;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly corridorCode: string;
  readonly entryAt: string;
  readonly exitAt: string;
  readonly protected: boolean;
  readonly sourceType: 'TIMETABLE' | 'COA' | 'FORECAST';
}

export interface GoodsForecast {
  readonly id: string;
  readonly corridorId: string;
  readonly corridorCode: string;
  readonly bucketStart: string;
  readonly bucketEnd: string;
  readonly expectedTrainCount: number;
  readonly lowerCount: number;
  readonly upperCount: number;
  readonly sourceType: 'COA' | 'DEMO_MODEL';
}

export interface BlockWindow {
  readonly id: string;
  readonly externalId: string;
  readonly corridorId: string;
  readonly corridorCode: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly durationMinutes: number;
  readonly availableLineCount: number;
  readonly powerIsolationAvailable: boolean;
  readonly signallingDisconnectionAvailable: boolean;
  readonly confidence: number;
  readonly status: 'AVAILABLE' | 'UNAVAILABLE';
}
