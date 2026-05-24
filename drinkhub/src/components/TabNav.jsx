export default function TabNav({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'dashboard', label: 'Đồng bộ', icon: '♻️' },
    { id: 'inventory', label: 'Tải lại cấu hình', icon: '⚙️' },
    { id: 'support', label: 'Mở hỗ trợ', icon: '❓' },
  ]

  return (
    <div className="flex gap-2 bg-linear-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-lg p-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
            activeTab === tab.id
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  )
}
