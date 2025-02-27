import { FC, useEffect, useState } from 'react'
import LoadingBranded from '@/shared/components/loading-branded'
import useWaitForI18n from '@/shared/hooks/use-wait-for-i18n'
import getMeta from '@/utils/meta'
import { useConnectionContext } from '../context/connection-context'
import { useIdeReactContext } from '@/features/ide-react/context/ide-react-context'

type Part = 'initial' | 'render' | 'connection' | 'translations' | 'project'

const initialParts = new Set<Part>(['initial'])

const totalParts = new Set<Part>([
  'initial',
  'render',
  'connection',
  'translations',
  'project',
])

export const Loading: FC<{
  setLoaded: (value: boolean) => void
}> = ({ setLoaded }) => {
  const [loadedParts, setLoadedParts] = useState(initialParts)

  const progress = (loadedParts.size / totalParts.size) * 100

  useEffect(() => {
    setLoaded(progress === 100)
  }, [progress, setLoaded])

  const { connectionState, isConnected } = useConnectionContext()
  const i18n = useWaitForI18n()
  const { projectJoined } = useIdeReactContext()

  useEffect(() => {
    setLoadedParts(value => new Set(value).add('render'))
  }, [])

  useEffect(() => {
    if (isConnected) {
      setLoadedParts(value => new Set(value).add('connection'))
    }
  }, [isConnected])

  useEffect(() => {
    if (i18n.isReady) {
      setLoadedParts(value => new Set(value).add('translations'))
    }
  }, [i18n.isReady])

  useEffect(() => {
    if (projectJoined) {
      setLoadedParts(value => new Set(value).add('project'))
    }
  }, [projectJoined])

  const error =
    connectionState.error ||
    (i18n.error ? getMeta('ol-translationLoadErrorMessage') : '')

  // Use loading text from the server, because i18n will not be ready initially
  const label = getMeta('ol-loadingText')

  return (
    <div className="loading-screen">
      <LoadingBranded loadProgress={progress} label={label} error={error} />
    </div>
  )
}
