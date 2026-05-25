import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { Toaster } from "vue-sonner";
import App from "./App.vue";
import "./style.css";

import RenamerPage from "./pages/RenamerPage.vue";
import TaggerPage from "./pages/TaggerPage.vue";
import BulkTaggerPage from "./pages/BulkTaggerPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/renamer" },
    { path: "/renamer", component: RenamerPage },
    { path: "/tagger", component: TaggerPage },
    { path: "/bulk-tagger", component: BulkTaggerPage },
  ],
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.component("Toaster", Toaster);
app.mount("#app");
