import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { useEditorContext } from '@/shared/context/editor-context'
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { PermissionsLevel } from '@/features/ide-react/types/permissions'
import { UnsavedDocsLockedModal } from '@/features/ide-react/components/unsaved-docs/unsaved-docs-locked-modal'
import { UnsavedDocsAlert } from '@/features/ide-react/components/unsaved-docs/unsaved-docs-alert'
import useEventListener from '@/shared/hooks/use-event-listener'

const MAX_UNSAVED_SECONDS = 15 // lock the editor after this time if unsaved

export const UnsavedDocs: FC = () => {
  const { openDocs } = useEditorManagerContext()
  const { permissionsLevel, setPermissionsLevel } = useEditorContext()
  const [isLocked, setIsLocked] = useState(false)
  const [unsavedDocs, setUnsavedDocs] = useState(new Map<string, number>())

  // always contains the latest value
  const previousUnsavedDocsRef = useRef(unsavedDocs)
  useEffect(() => {
    previousUnsavedDocsRef.current = unsavedDocs
  }, [unsavedDocs])

  // always contains the latest value
  const permissionsLevelRef = useRef(permissionsLevel)
  useEffect(() => {
    permissionsLevelRef.current = permissionsLevel
  }, [permissionsLevel])

  // warn if the window is being closed with unsaved changes
  useEventListener(
    'beforeunload',
    useCallback(
      event => {
        if (openDocs.hasUnsavedChanges()) {
          // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
          event.preventDefault()
        }
      },
      [openDocs]
    )
  )

  // keep track of which docs are currently unsaved, and how long they've been unsaved for
  // NOTE: openDocs should never change, so it's safe to use as a dependency here
  useEffect(() => {
    const interval = window.setInterval(() => {
      const unsavedDocs = new Map()

      const unsavedDocIds = openDocs.unsavedDocIds()

      for (const docId of unsavedDocIds) {
        const unsavedSeconds =
          (previousUnsavedDocsRef.current.get(docId) ?? 0) + 1
        unsavedDocs.set(docId, unsavedSeconds)
      }

      // avoid setting the unsavedDocs state to a new empty Map every second
      if (unsavedDocs.size > 0 || previousUnsavedDocsRef.current.size > 0) {
        previousUnsavedDocsRef.current = unsavedDocs
        setUnsavedDocs(unsavedDocs)
      }
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [openDocs])

  const maxUnsavedSeconds = Math.max(0, ...unsavedDocs.values())

  // lock the editor if at least one doc has been unsaved for too long
  useEffect(() => {
    setIsLocked(maxUnsavedSeconds > MAX_UNSAVED_SECONDS)
  }, [maxUnsavedSeconds])

  // display a modal and set the permissions level to readOnly if docs have been unsaved for too long
  const originalPermissionsLevelRef = useRef<PermissionsLevel | null>(null)
  useEffect(() => {
    if (isLocked) {
      originalPermissionsLevelRef.current = permissionsLevelRef.current
      // TODO: what if the real permissions level changes in the meantime?
      // TODO: perhaps the "locked" state should be stored in the editor context instead?
      setPermissionsLevel('readOnly')
      setIsLocked(true)
    } else {
      if (originalPermissionsLevelRef.current) {
        setPermissionsLevel(originalPermissionsLevelRef.current)
      }
    }
  }, [isLocked, setPermissionsLevel])

  // remove the modal (and unlock the page) if the connection has been re-established and all the docs have been saved
  useEffect(() => {
    if (unsavedDocs.size === 0 && permissionsLevelRef.current === 'readOnly') {
      setIsLocked(false)
    }
  }, [unsavedDocs])

  return (
    <>
      {isLocked && <UnsavedDocsLockedModal />}
      {unsavedDocs.size > 0 && <UnsavedDocsAlert unsavedDocs={unsavedDocs} />}
    </>
  )
}
