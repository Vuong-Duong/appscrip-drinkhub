export default function FeatureCard({ feature, Icon }) {
  return (
    <button
      className="w-full bg-white border border-gray-200 rounded-3xl px-8 py-5 shadow-md cursor-pointer text-left active:scale-95 transition-transform hover:shadow-lg"
    >
      <div className="flex items-center gap-6">
        <div className="bg-linear-to-br from-blue-50 to-cyan-50 rounded-2xl p-5 shrink-0">
          {Icon && (
            <Icon
              size={48}
              className="text-blue-600"
              strokeWidth={1.5}
            />
          )}
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-lg leading-snug">
            {feature.id}. {feature.name}
          </h3>
        </div>
      </div>
    </button>
  )
}