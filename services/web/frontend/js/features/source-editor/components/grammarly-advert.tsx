import { useCallback, useEffect, useState } from 'react'
import MaterialIcon from '@/shared/components/material-icon'
import * as eventTracking from '../../../infrastructure/event-tracking'
import customLocalStorage from '../../../infrastructure/local-storage'
import useWaitForGrammarlyCheck from '@/shared/hooks/use-wait-for-grammarly-check'
export default function GrammarlyAdvert() {
  const [show, setShow] = useState(false)

  // grammarly can take some time to load, we should assume its installed and hide until we know for sure
  const grammarlyInstalled = useWaitForGrammarlyCheck({ initialState: false })

  useEffect(() => {
    const hasDismissedGrammarlyAdvert = customLocalStorage.getItem(
      'editor.has_dismissed_grammarly_advert'
    )
    // promotion ends on december 16th, 2023 at 00:00 UTC
    const promotionEnded =
      new Date() > new Date(Date.UTC(2023, 11, 16, 0, 0, 0))

    const showGrammarlyAdvert =
      grammarlyInstalled && !hasDismissedGrammarlyAdvert && !promotionEnded

    if (showGrammarlyAdvert) {
      eventTracking.sendMB('grammarly-advert-shown')
      setShow(true)
    }
  }, [grammarlyInstalled, setShow])

  const handleClose = useCallback(() => {
    setShow(false)
    customLocalStorage.setItem('editor.has_dismissed_grammarly_advert', true)
    eventTracking.sendMB('grammarly-advert-dismissed')
  }, [])

  if (!show) {
    return null
  }

  return (
    <div className="alert alert-info grammarly-advert" role="alert">
      <div className="grammarly-advert-container">
        <div className="advert-content">
          <p>
            Overleafers get a limited-time 30% discount on Grammarly Premium.
            (Hurry! Offer ends December 15.)
          </p>
          <a
            className="advert-link"
            onClick={() => eventTracking.sendMB('grammarly-advert-clicked')}
            href="https://grammarly.go2cloud.org/aff_c?offer_id=372&aff_id=142242"
            target="_blank"
            rel="noopener"
          >
            Claim my discount
          </a>
        </div>
        <div className="grammarly-notification-close-btn">
          <button aria-label="Close" onClick={handleClose}>
            <MaterialIcon type="close" />
          </button>
        </div>
      </div>
    </div>
  )
}
