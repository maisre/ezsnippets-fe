import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Snippets } from './snippets/snippets';
import { Pages } from './pages/pages';
import { PageEdit } from './page-edit/page-edit';
import { Layouts } from './layouts/layouts';
import { LayoutEdit } from './layout-edit/layout-edit';
import { StripeTest } from './stripe-test/stripe-test';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'home', component: Home },
  { path: 'login', component: Login },
  { path: 'snippets', component: Snippets },
  { path: 'p/edit/:id', component: PageEdit },
  { path: 'pages', component: Pages },
  { path: 'l/edit/:id', component: LayoutEdit },
  { path: 'layouts', component: Layouts },
  { path: 'stripe', component: StripeTest },
];
