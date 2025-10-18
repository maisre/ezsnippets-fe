import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './login/login';
import { Snippets } from './snippets/snippets';
import { Pages } from './pages/pages';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'home', component: Home },
  { path: 'login', component: Login },
  { path: 'snippets', component: Snippets },
  { path: 'pages', component: Pages },
];
