import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";

export default function FeaturePage() {
  const navigate = useNavigate();
  const { featureId } = useParams();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="pt-20 px-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/")}
            className="text-3xl text-gray-600 hover:text-gray-900"
          >
            &larr;
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Tính năng {featureId}
          </h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-800">Đang phát triển</p>
          <p className="text-gray-500 mt-3">
            Tính năng này sẽ được cập nhật trong các phiên bản tiếp theo.
          </p>
        </div>
      </main>
    </div>
  );
}
