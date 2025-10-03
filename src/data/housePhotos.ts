// Image metadata for villa gallery (previously auto-generated).
export interface HousePhoto { src: string; }

export type HousePhotoRoomKey = 'living' | 'kitchen' | 'bedroom' | 'balcony' | 'bathroom';

export const housePhotosByRoom: Record<HousePhotoRoomKey, HousePhoto[]> = {
  living: [
    { src: '/house/living/475a9218-d046-4224-aafe-ea70c4bfb8ab.jpeg' },
    { src: '/house/living/att.cHicxncSMUEm4RWJX_TOPezn7NPvxWRt7Z0xKZ8nylE.jpeg' },
    { src: '/house/living/att.Yn28iPs2Mlcb6kxutb7k2Rr2YYprruwoyORKIBWoy4o.jpeg' },
  ],
  kitchen: [
    { src: '/house/kitchen/att.FcEjVIjFuWRZjLgXbVE8uocMCMkIQ23IOfjVpyylEGM.jpeg' },
    { src: '/house/kitchen/att.JGRBgs9ovAV-CEXk7VOv6224jjA1IwYvXPv0eNz-WHk.jpeg' },
  ],
  bedroom: [
    { src: '/house/bedroom/att.-sSAa-Aqr6M79W5tzRfGuWaT7E_YW5gJ6W31g9kSbt4 (1).jpeg' },
    { src: '/house/bedroom/att.-sSAa-Aqr6M79W5tzRfGuWaT7E_YW5gJ6W31g9kSbt4.jpeg' },
  ],
  balcony: [
    { src: '/house/balcony/att.2iOa_EiFOL23pgniy4oB6kuPnRdRcbo1edshfJlSkuk.jpeg' },
    { src: '/house/balcony/att.pq0r63Hqen-MwVttIXHwKIoyGEcBXZDt2H5zqp_R8dY.jpeg' },
  ],
  bathroom: [
    { src: '/house/bathroom/att.fYppcKEpB0t2ddiZJ0vvc8QJi9WsxArQdE3c-PwRV4E.jpeg' },
    { src: '/house/bathroom/att.hsCB4VABzPjApJOMxX32gJaSSGQmih7jl-OTFW4xQ2U (1).jpeg' },
    { src: '/house/bathroom/att.hsCB4VABzPjApJOMxX32gJaSSGQmih7jl-OTFW4xQ2U.jpeg' },
  ],
};

export const housePhotos: HousePhoto[] = Object.values(housePhotosByRoom).flat();
