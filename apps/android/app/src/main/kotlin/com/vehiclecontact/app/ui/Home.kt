package com.vehiclecontact.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vehiclecontact.app.call.Conn
import com.vehiclecontact.app.vecs

private enum class Tab(val label: String, val icon: ImageVector) {
    SUMMARY("Beranda", Icons.Default.Home),
    VEHICLES("Kendaraan", Icons.Default.Place),
    REPORTS("Laporan", Icons.AutoMirrored.Filled.List),
    CALLS("Panggilan", Icons.Default.Call),
    ACCOUNT("Akun", Icons.Default.Person),
}

@Composable
fun HomeNav() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "tabs") {
        composable("tabs") { Tabs(onReport = { nav.navigate("report/$it") }, onNotifications = { nav.navigate("notifications") }) }
        composable("report/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { e ->
            SubScreen("Detail laporan", onBack = { nav.popBackStack() }) { ReportDetailScreen(e.arguments?.getString("id") ?: "") }
        }
        composable("notifications") { SubScreen("Notifikasi", onBack = { nav.popBackStack() }) { NotificationsScreen() } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubScreen(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Scaffold(
        containerColor = Paper,
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.SemiBold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Paper),
            )
        },
    ) { pad -> Box(Modifier.padding(pad).fillMaxSize()) { content() } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Tabs(onReport: (String) -> Unit, onNotifications: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(Tab.SUMMARY) }
    val engine = LocalContext.current.vecs.engine
    val conn by engine.connection.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = Paper,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Vehicle", fontWeight = FontWeight.Bold, fontSize = 17.sp); Spacer(Modifier.width(4.dp)); Text("Contact", color = Brand, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    }
                },
                actions = {
                    val (dot, label) = when (conn) { Conn.ONLINE -> MintDeep to "Online"; Conn.CONNECTING -> AmberDeep to "Menyambung"; Conn.OFFLINE -> Coral to "Offline" }
                    Row(Modifier.clip(CircleShape).background(Color.White).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(dot)); Spacer(Modifier.width(6.dp)); Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                    IconButton(onClick = onNotifications) { Icon(Icons.Default.Notifications, contentDescription = "Notifikasi") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Paper),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = Color.White, tonalElevation = 0.dp) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t, onClick = { tab = t }, icon = { Icon(t.icon, contentDescription = t.label) }, label = { Text(t.label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Brand, selectedTextColor = Brand, indicatorColor = BrandSoft,
                            unselectedIconColor = Muted, unselectedTextColor = Muted,
                        ),
                    )
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                Tab.SUMMARY -> SummaryScreen(onReport = onReport, onOpenReports = { tab = Tab.REPORTS }, onOpenCalls = { tab = Tab.CALLS })
                Tab.VEHICLES -> VehiclesScreen()
                Tab.REPORTS -> ReportsScreen(onReport = onReport)
                Tab.CALLS -> CallsScreen()
                Tab.ACCOUNT -> SettingsScreen()
            }
        }
    }
}
