import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import ToastContainer from './components/ToastContainer'
import StatusPage from './pages/StatusPage'
import ConfigPage from './pages/ConfigPage'
import FriendsPage from './pages/FriendsPage'
import GroupsPage from './pages/GroupsPage'
import { useStatus } from './hooks/useStatus'
import { useTheme } from './hooks/useTheme'

export type PageId = 'status' | 'friends' | 'groups' | 'config'

const pageConfig: Record<PageId, { title: string; desc: string }> = {
  status: { title: '仪表盘', desc: '账号概览与操作统计' },
  friends: { title: '好友管理', desc: '批量删除、移动分组、修改备注' },
  groups: { title: '群聊管理', desc: '批量退群、修改群备注' },
  config: { title: '插件配置', desc: '安全开关与操作间隔' },
}

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('friends')
  const [isScrolled, setIsScrolled] = useState(false)
  const { status, fetchStatus } = useStatus()

  useTheme()

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 8000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 10)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'status':
        return <StatusPage status={status} onRefresh={fetchStatus} />
      case 'friends':
        return <FriendsPage config={status?.config} onOpDone={fetchStatus} />
      case 'groups':
        return <GroupsPage config={status?.config} onOpDone={fetchStatus} />
      case 'config':
        return <ConfigPage />
      default:
        return <FriendsPage config={status?.config} onOpDone={fetchStatus} />
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8f9fa] dark:bg-[#18191C] text-gray-800 dark:text-gray-200 transition-colors duration-300">
      <ToastContainer />
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          <Header
            title={pageConfig[currentPage].title}
            description={pageConfig[currentPage].desc}
            isScrolled={isScrolled}
            status={status}
            currentPage={currentPage}
          />
          <div className="px-4 md:px-8 pb-8">
            <div key={currentPage} className="page-enter">
              {renderPage()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
