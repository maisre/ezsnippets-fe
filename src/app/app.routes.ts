import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { Pricing } from './pricing/pricing';
import { Snippets } from './snippets/snippets';
import { Pages } from './pages/pages';
import { PageEdit } from './page-edit/page-edit';
import { Layouts } from './layouts/layouts';
import { LayoutEdit } from './layout-edit/layout-edit';
import { StripeTest } from './stripe-test/stripe-test';
import { NotFound } from './not-found/not-found';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'home', component: Home },
  { path: 'pricing', component: Pricing },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'snippets', component: Snippets, canActivate: [authGuard] },
  { path: 'p/edit/:id', component: PageEdit, canActivate: [authGuard] },
  { path: 'pages', component: Pages, canActivate: [authGuard] },
  { path: 'l/edit/:id', component: LayoutEdit, canActivate: [authGuard] },
  { path: 'layouts', component: Layouts, canActivate: [authGuard] },
  { path: 'stripe', component: StripeTest, canActivate: [authGuard] },
  { path: '**', component: NotFound },
];
