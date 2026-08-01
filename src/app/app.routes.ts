import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { ForgotPassword } from './forgot-password/forgot-password';
import { ResetPassword } from './reset-password/reset-password';
import { Pricing } from './pricing/pricing';
import { Snippets } from './snippets/snippets';
import { Pages } from './pages/pages';
import { PageEdit } from './page-edit/page-edit';
import { Layouts } from './layouts/layouts';
import { LayoutEdit } from './layout-edit/layout-edit';
import { Account } from './account/account';
import { Dashboard } from './dashboard/dashboard';
import { CheckoutSuccess } from './checkout-success/checkout-success';
import { Terms } from './legal/terms/terms';
import { Privacy } from './legal/privacy/privacy';
import { Refunds } from './legal/refunds/refunds';
import { NotFound } from './not-found/not-found';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'home', component: Home },
  { path: 'pricing', component: Pricing },
  { path: 'checkout/success', component: CheckoutSuccess },
  // Public and deliberately outside the comingSoon gate — Paddle checks these
  // URLs during website approval, before we open sign-ups.
  { path: 'terms', component: Terms },
  { path: 'privacy', component: Privacy },
  { path: 'refunds', component: Refunds },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'reset-password', component: ResetPassword },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'snippets', component: Snippets, canActivate: [authGuard] },
  // hideFooter: the builders are full-viewport (100vh) editors with live
  // previews — a site footer underneath breaks the layout.
  { path: 'p/edit/:id', component: PageEdit, canActivate: [authGuard], data: { hideFooter: true } },
  { path: 'pages', component: Pages, canActivate: [authGuard] },
  { path: 'l/edit/:id', component: LayoutEdit, canActivate: [authGuard], data: { hideFooter: true } },
  { path: 'layouts', component: Layouts, canActivate: [authGuard] },
  { path: 'account', component: Account, canActivate: [authGuard] },
  { path: '**', component: NotFound },
];
