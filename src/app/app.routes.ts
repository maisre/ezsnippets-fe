import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { ForgotPassword } from './forgot-password/forgot-password';
import { ResetPassword } from './reset-password/reset-password';
import { Pricing } from './pricing/pricing';
import { Pages } from './pages/pages';
import { Layouts } from './layouts/layouts';
import { Account } from './account/account';
import { Dashboard } from './dashboard/dashboard';
import { CheckoutSuccess } from './checkout-success/checkout-success';
import { Pay } from './pay/pay';
import { Terms } from './legal/terms/terms';
import { Privacy } from './legal/privacy/privacy';
import { Refunds } from './legal/refunds/refunds';
import { NotFound } from './not-found/not-found';
import { Team } from './team/team';
import { Invite } from './invite/invite';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', title: 'EZ Snippet — Build websites faster with reusable snippets', component: Home },
  { path: 'home', title: 'EZ Snippet — Build websites faster with reusable snippets', component: Home },
  { path: 'pricing', title: 'Pricing · EZ Snippet', component: Pricing },
  { path: 'checkout/success', component: CheckoutSuccess },
  // Paddle's default payment link target. Public and unguarded on purpose:
  // Paddle sends customers here from dunning and update-payment-method emails,
  // and they are frequently not signed in. See pay.ts.
  { path: 'pay', component: Pay },
  // Public and deliberately outside the comingSoon gate — Paddle checks these
  // URLs during website approval, before we open sign-ups.
  { path: 'terms', title: 'Terms of Service · EZ Snippet', component: Terms },
  { path: 'privacy', title: 'Privacy Policy · EZ Snippet', component: Privacy },
  { path: 'refunds', title: 'Refund Policy · EZ Snippet', component: Refunds },
  { path: 'login', title: 'Log in · EZ Snippet', component: Login },
  { path: 'signup', title: 'Sign up · EZ Snippet', component: Signup },
  { path: 'forgot-password', title: 'Forgot password · EZ Snippet', component: ForgotPassword },
  { path: 'reset-password', title: 'Reset password · EZ Snippet', component: ResetPassword },
  { path: 'dashboard', title: 'Dashboard · EZ Snippet', component: Dashboard, canActivate: [authGuard] },
  { path: 'snippets', redirectTo: 'dashboard' },
  // hideFooter: the builders are full-viewport (100vh) editors with live
  // previews — a site footer underneath breaks the layout.
  // The editors are the heaviest screens (drag and drop, preview, snippet
  // library) and only signed-in users reach them, so they load on demand.
  { path: 'p/edit/:id', title: 'Edit page · EZ Snippet', loadComponent: () => import('./page-edit/page-edit').then((m) => m.PageEdit), canActivate: [authGuard], data: { hideFooter: true } },
  { path: 'pages', title: 'Pages · EZ Snippet', component: Pages, canActivate: [authGuard] },
  { path: 'l/edit/:id', title: 'Edit layout · EZ Snippet', loadComponent: () => import('./layout-edit/layout-edit').then((m) => m.LayoutEdit), canActivate: [authGuard], data: { hideFooter: true } },
  { path: 'layouts', title: 'Layouts · EZ Snippet', component: Layouts, canActivate: [authGuard] },
  { path: 'account', title: 'Account · EZ Snippet', component: Account, canActivate: [authGuard] },
  { path: 'team', title: 'Team · EZ Snippet', component: Team, canActivate: [authGuard] },
  // Public — invitees usually don't have an account yet. See invite.ts.
  { path: 'invite/:token', component: Invite },
  { path: '**', title: 'Page not found · EZ Snippet', component: NotFound },
];
