// Power Rankings edition identity — the CURRENT edition, derived.
//
// Split out so the Dashboard tile, the hook and the view can name the
// edition without any of them pulling in content. It is no longer written
// here: data/articles.js lists every edition and the newest is the current
// one, so publishing next year's rankings is one entry in one file and this
// follows automatically.
import { ARTICLES } from './articles'
import { currentArticle } from '../services/archive'

const current = currentArticle(ARTICLES, 'rankings')

export const edition = current?.edition ?? ''
/** The Firestore document id: powerRankings/{editionId}. */
export const editionId = current?.id ?? ''
