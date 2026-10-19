import { CARD_IMAGE_IMPORTS, MAGE_TOKEN_IMAGE_IMPORTS, NEMESIS_MAT_IMAGE_IMPORTS } from './generated-image-imports'
import { getCard } from '@engine/data'
import playerCardBack from '../../image-database/common images/player-card back.jpg'
import treasureTwoBack from '../../image-database/common images/treasure 2 back.jpg'
import treasureThreeBack from '../../image-database/common images/treasure 3 back.jpg'
import quFormTakerImage from "../../image-database/cards/wave9/mages/qu/Qu's Form Card Back.jpg"
import nemesisCardBack from '../../image-database/common images/nemesis card back.jpg'
import rageborneStrikeDeckBack from '../../image-database/cards/wave1/nemesis/Rageborne/strike deck/Strike Deck Back.png'
import rageborneFuryToken from '../../image-database/cards/wave1/nemesis/Rageborne/Fury Token UI.png'
import nemesisToken from '../../image-database/common images/NemesisToken.png'
import terrorInBrassToken from '../../image-database/cards/wave9/nemesis/The Terror in Brass/The Terror in Brass Token.jpg'
import aetherToken from '../../image-database/common images/Aether Token.png'
import pulseToken from '../../image-database/common images/Pulse_token.png'
import trinketDeckBack from '../../image-database/cards/wave9/trinkets/trinket deck back.png'
import playerOneTurnToken from '../../image-database/common images/turn order images/token/105px-Player_1.png'
import playerTwoTurnToken from '../../image-database/common images/turn order images/token/105px-Player_2.png'
import nemesisTurnToken from '../../image-database/common images/turn order images/token/Nemesis Turn Order Token 128.png'

export function cardImageUrl(cardId: string): string | undefined {
  return CARD_IMAGE_IMPORTS[cardId]
}

export function specificDeckCardImageUrl(
  mageType: string, cardId: string, formSide?: 'giver' | 'taker',
): string | undefined {
  if (mageType === 'qu' && cardId === 'qus_form_card' && formSide === 'taker') return quFormTakerImage
  return cardImageUrl(cardId)
}

export function mageTokenImageUrl(tokenId: string): string | undefined {
  return MAGE_TOKEN_IMAGE_IMPORTS[tokenId]
}

export function playerCardBackUrl(): string {
  return playerCardBack
}

export function nemesisCardBackUrl(): string {
  return nemesisCardBack
}

export function nemesisSpecificDeckBackUrl(nemesisType: string): string {
  if (nemesisType === 'rageborne') return rageborneStrikeDeckBack
  if (nemesisType === 'crooked_mask' || nemesisType === 'oracle_of_filth') return playerCardBack
  return nemesisCardBack
}

export function nemesisTokenImageUrl(nemesisType: string, tokenName: string): string | undefined {
  if (nemesisType === 'rageborne' && tokenName === 'fury') return rageborneFuryToken
  if (nemesisType === 'the_terror_in_brass' && tokenName === 'terror') return terrorInBrassToken
  if (tokenName === 'nemesis' || tokenName === 'nemesis_token') return nemesisToken
  return undefined
}

export function aetherTokenImageUrl(): string {
  return aetherToken
}

export function pulseTokenImageUrl(): string {
  return pulseToken
}

export function trinketDeckBackUrl(): string {
  return trinketDeckBack
}

/** Use the Trinket back whenever a Trinket is the visible top card of a player deck. */
export function playerDeckCardBackUrl(cardId: string | null | undefined): string {
  if (!cardId) return playerCardBackUrl()
  const card = getCard(cardId)
  return card.type === 'gem' && card.mechanics?.includes('trinket')
    ? trinketDeckBackUrl()
    : playerCardBackUrl()
}

export function playerTurnOrderTokenUrl(playerNumber: number): string | undefined {
  if (playerNumber === 1) return playerOneTurnToken
  if (playerNumber === 2) return playerTwoTurnToken
  return undefined
}

export function nemesisTurnOrderTokenUrl(): string {
  return nemesisTurnToken
}

export type SpecificDeckBack = 'treasure_1' | 'treasure_2' | 'treasure_3' | 'player'

export function specificDeckBackUrl(back: SpecificDeckBack = 'player'): string | undefined {
  if (back === 'treasure_3') return treasureThreeBack
  if (back === 'treasure_2') return treasureTwoBack
  if (back === 'player') return playerCardBack
  return undefined
}

export function nemesisMatImageUrl(
  nemesisType = 'rageborne', side: 'front' | 'back' = 'front',
): string | undefined {
  return NEMESIS_MAT_IMAGE_IMPORTS[nemesisType]?.[side]
}
