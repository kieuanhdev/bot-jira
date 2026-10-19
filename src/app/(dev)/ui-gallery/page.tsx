import { notFound } from "next/navigation";
import { UIGalleryClient } from "./ui-gallery-client";

export const metadata = {
  title: "UI Component Gallery (Dev)",
  description: "Dev-only showcase for design tokens and primitives in light and dark mode",
};

export default function UIGalleryPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UIGalleryClient />;
}
