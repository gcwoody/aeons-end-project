export interface SubBoardRegion {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface SubBoardAnchor {
  id: string
  label: string
  regionId: string
  x: number
  y: number
  tokenSize: { width: number; height: number }
}

export interface SubBoardLayoutDocument {
  schemaVersion: 2
  boardId: string
  boardName: string
  imageFile: string
  imageSize: { width: number; height: number }
  regions: SubBoardRegion[]
  anchors: SubBoardAnchor[]
}

export interface SubBoardImageOption {
  id: string
  label: string
  imageUrl: string
  imageFile: string
  width: number
  height: number
  starterLayout?: Pick<SubBoardLayoutDocument, 'regions' | 'anchors'>
}
