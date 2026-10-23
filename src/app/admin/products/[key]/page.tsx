import { ProductDetailView } from "../../../../components/views/ProductDetailView";

interface PageProps {
  params: Promise<{ key: string }>;
}

export default async function AdminProductDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const decodedKey = decodeURIComponent(resolvedParams.key);
  return <ProductDetailView productKey={decodedKey} />;
}
