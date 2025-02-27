import { Panel, PanelGroup } from 'react-resizable-panels'
import { FC } from 'react'
import { HorizontalResizeHandle } from '../resize/horizontal-resize-handle'
import classNames from 'classnames'
import { useLayoutContext } from '@/shared/context/layout-context'
import EditorNavigationToolbar from '@/features/ide-react/components/editor-navigation-toolbar'
import ChatPane from '@/features/chat/components/chat-pane'
import { HorizontalToggler } from '@/features/ide-react/components/resize/horizontal-toggler'
import { HistorySidebar } from '@/features/ide-react/components/history-sidebar'
import { HistoryProvider } from '@/features/history/context/history-context'
import History from '@/features/ide-react/components/history'
import EditorSidebar from '@/features/ide-react/components/editor-sidebar'
import { EditorPane } from '@/features/ide-react/components/editor/editor-pane'
import { useFileTree } from '@/features/ide-react/hooks/use-file-tree'
import { useTranslation } from 'react-i18next'
import { useSidebarPane } from '@/features/ide-react/hooks/use-sidebar-pane'
import { useChatPane } from '@/features/ide-react/hooks/use-chat-pane'
import { EditorAndPdf } from '@/features/ide-react/components/editor-and-pdf'

export const MainLayout: FC = () => {
  const { view } = useLayoutContext()

  const {
    isOpen: sidebarIsOpen,
    setIsOpen: setSidebarIsOpen,
    fixedPanelRef: sidebarPanelRef,
    handleLayout: handleSidebarLayout,
    togglePane: toggleSidebar,
    handlePaneExpand: handleSidebarExpand,
    handlePaneCollapse: handleSidebarCollapse,
    resizing: sidebarResizing,
    setResizing: setSidebarResizing,
  } = useSidebarPane()

  const {
    isOpen: chatIsOpen,
    fixedPanelRef: chatPanelRef,
    handleLayout: handleChatLayout,
    togglePane: toggleChat,
    resizing: chatResizing,
    setResizing: setChatResizing,
    handlePaneCollapse: handleChatCollapse,
    handlePaneExpand: handleChatExpand,
  } = useChatPane()

  const {
    selectedEntityCount,
    openEntity,
    openDocId,
    handleFileTreeInit,
    handleFileTreeSelect,
    handleFileTreeDelete,
  } = useFileTree()

  const { t } = useTranslation()

  // keep the editor pane open
  const editorPane = openDocId ? (
    <EditorPane
      show={openEntity?.type === 'doc' && selectedEntityCount === 1}
    />
  ) : null

  return (
    <div className="ide-react-main">
      <EditorNavigationToolbar />
      <div className="ide-react-body">
        <PanelGroup
          autoSaveId="ide-outer-layout"
          direction="horizontal"
          onLayout={handleSidebarLayout}
          className={classNames({
            'ide-panel-group-resizing': sidebarResizing || chatResizing,
          })}
        >
          {/* sidebar */}
          <Panel
            ref={sidebarPanelRef}
            id="panel-sidebar"
            order={1}
            defaultSizePixels={200}
            minSizePixels={150}
            collapsible
            onCollapse={handleSidebarCollapse}
            onExpand={handleSidebarExpand}
          >
            <EditorSidebar
              shouldShow={view !== 'history'}
              onFileTreeInit={handleFileTreeInit}
              onFileTreeSelect={handleFileTreeSelect}
              onFileTreeDelete={handleFileTreeDelete}
            />
            {view === 'history' && <HistorySidebar />}
          </Panel>

          <HorizontalResizeHandle
            onDoubleClick={toggleSidebar}
            resizable={sidebarIsOpen}
            onDragging={setSidebarResizing}
          >
            <HorizontalToggler
              id="panel-sidebar"
              togglerType="west"
              isOpen={sidebarIsOpen}
              setIsOpen={setSidebarIsOpen}
              tooltipWhenOpen={t('tooltip_hide_filetree')}
              tooltipWhenClosed={t('tooltip_show_filetree')}
            />
          </HorizontalResizeHandle>

          <Panel id="panel-outer-main" order={2}>
            <PanelGroup
              autoSaveId="ide-inner-layout"
              direction="horizontal"
              onLayout={handleChatLayout}
            >
              <Panel className="ide-react-panel" id="panel-main" order={1}>
                {view === 'history' ? (
                  <HistoryProvider>
                    <History />
                  </HistoryProvider>
                ) : (
                  <EditorAndPdf
                    editorPane={editorPane}
                    selectedEntityCount={selectedEntityCount}
                    openEntity={openEntity}
                  />
                )}
              </Panel>

              <HorizontalResizeHandle
                onDoubleClick={toggleChat}
                resizable={chatIsOpen}
                onDragging={setChatResizing}
              />

              {/* chat */}
              <Panel
                ref={chatPanelRef}
                id="panel-chat"
                order={2}
                defaultSizePixels={200}
                minSizePixels={150}
                collapsible
                onCollapse={handleChatCollapse}
                onExpand={handleChatExpand}
              >
                <ChatPane />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
