# Badly formatted on purpose. Use Editor → Format Document to tidy it.
function   Test-Format
{
	param([string]$Name,[int]$Count=1)
	if($Name -eq "x")
	{Write-Host "x"
	} else
	{
		Write-Host   $Name
	}
	foreach($i in 1..$Count)
 {$i*2
	}
	$h=@{a=1;bb=2}
}
