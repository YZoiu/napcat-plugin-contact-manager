import type { PageId } from '../App'
import { IconDashboard, IconSettings, IconGroup, IconGithub, IconSun, IconUser } from './icons'

interface SidebarProps {
  currentPage: PageId
  onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: 'friends', label: '好友管理', icon: <IconUser size={18} /> },
  { id: 'groups', label: '群聊管理', icon: <IconGroup size={18} /> },
  { id: 'status', label: '仪表盘', icon: <IconDashboard size={18} /> },
  { id: 'config', label: '插件配置', icon: <IconSettings size={18} /> },
]

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-white dark:bg-[#1a1b1d] border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto nav-stagger">
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-2">
        <a
          href="https://napneko.github.io/develop/plugin/publish"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-item no-underline"
        >
          <IconGithub size={18} />
          <span>发布文档</span>
        </a>
      </div>

      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-center w-full py-2 rounded-lg text-gray-500 bg-gray-50 dark:bg-gray-800/50 cursor-default text-xs gap-2">
          <IconSun size={14} className="opacity-60" />
          <span>跟随系统主题</span>
        </div>
      </div>
    </aside>
  )
}
