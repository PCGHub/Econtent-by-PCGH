import { AuthForm, AuthLayout } from "@/components/account-ui";
export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      eyebrow="Account recovery"
      title=""
      copy="We will help you get back to your projects with a secure recovery flow."
    >
      <AuthForm mode="forgot" />
    </AuthLayout>
  );
}
